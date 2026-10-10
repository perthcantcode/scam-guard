/** Scam Guard — Link Analysis Module */

import { findBrand, officialDomainsFor } from './brands.js';

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 'cutt.ly', 'is.gd', 'rb.gy',
  'shorturl.at', 't.ly', 'goo.gl', 'ow.ly', 't.co',
  'tiny.cc', 'lnkd.in', 'surl.li', 'short.link', 'shorten.link'
]);

const ODD_TLDS = new Set([
  '.xyz', '.top', '.click', '.icu', '.vip', '.live', '.site',
  '.online', '.buzz', '.cfd', '.fun', '.club', '.work', '.surf',
  '.rest', '.monster', '.uno', '.cam', '.bar'
]);

const MULTI_LABEL_TLDS = new Set([
  '.com.ph', '.gov.ph', '.org.ph', '.net.ph', '.co.uk',
  '.co.jp', '.co.kr', '.co.in', '.com.au', '.com.br'
]);

// Match URLs with or without scheme
const URL_REGEX = /https?:\/\/[^\s<>"“”]+|(?<![@\w])(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[\/?#][^\s<>"“”]*)?/gi;

/**
 * Extract URLs from text
 * @param {string} text
 * @returns {string[]}
 */
export function extractUrls(text) {
  if (!text || typeof text !== 'string') return [];

  const matches = [];
  let match;
  const regex = new RegExp(URL_REGEX.source, URL_REGEX.flags);

  while ((match = regex.exec(text)) !== null) {
    let url = match[0];
    // Strip trailing punctuation
    url = url.replace(/[.,;:!?)]+$/, '');
    if (url.length > 4) {
      matches.push(url);
    }
  }

  return [...new Set(matches)];
}

/**
 * Get the registrable domain from a hostname
 * @param {string} host
 * @returns {string}
 */
function getRegistrableDomain(host) {
  host = host.toLowerCase().replace(/^www\./, '');

  for (const tld of MULTI_LABEL_TLDS) {
    if (host.endsWith(tld)) {
      const withoutTld = host.slice(0, -tld.length);
      const parts = withoutTld.split('.');
      return parts[parts.length - 1] + tld;
    }
  }

  const parts = host.split('.');
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  return host;
}

/**
 * Get hostname from a URL string
 */
function getHost(url) {
  try {
    let clean = url;
    if (!/^https?:\/\//i.test(clean)) clean = 'https://' + clean;
    const parsed = new URL(clean);
    return parsed.hostname.toLowerCase();
  } catch {
    // Fallback: extract domain manually
    let host = url.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
    return host.toLowerCase();
  }
}

/**
 * Simple Levenshtein distance
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Analyze links in text for suspicious patterns
 * @param {string} text
 * @returns {{ score: number, links: Array, flags: Array }}
 */
export function analyzeLinks(text) {
  if (!text || typeof text !== 'string') {
    return { score: 0, links: [], flags: [] };
  }

  const urls = extractUrls(text);
  if (urls.length === 0) {
    return { score: 0, links: [], flags: [] };
  }

  const flags = [];
  const flagTypes = new Set();
  const analyzedLinks = [];
  const brand = findBrand(text);

  for (const url of urls) {
    const host = getHost(url);
    const domain = getRegistrableDomain(host);
    const issues = [];

    // Shortener check
    if (SHORTENERS.has(host) || SHORTENERS.has(domain)) {
      issues.push('shortener');
    }

    // Odd TLD
    for (const tld of ODD_TLDS) {
      if (host.endsWith(tld)) {
        issues.push('odd_tld');
        break;
      }
    }

    // Punycode
    if (host.includes('xn--')) {
      issues.push('punycode');
    }

    // IP address host
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
      issues.push('ip_host');
    }

    // @ sign trick (used in phishing URLs)
    if (url.includes('@')) {
      issues.push('at_sign_trick');
    }

    // Many hyphens
    const hostWithoutTld = host.split('.').slice(0, -1).join('.');
    if ((hostWithoutTld.match(/-/g) || []).length >= 3) {
      issues.push('many_hyphens');
    }

    // Lookalike domain check against brands
    if (brand) {
      const officialDomains = officialDomainsFor(brand.id);

      if (officialDomains.length > 0) {
        const isOfficial = officialDomains.some(od =>
          host === od || host.endsWith('.' + od)
        );

        if (!isOfficial) {
          // Check if brand token is in the host
          const brandLower = brand.id.toLowerCase();
          if (host.replace(/-/g, '').includes(brandLower)) {
            issues.push('lookalike_domain');
          }

          // Levenshtein distance check
          for (const od of officialDomains) {
            if (levenshtein(domain, od) <= 2 && domain !== od) {
              if (!issues.includes('lookalike_domain')) {
                issues.push('lookalike_domain');
              }
            }
          }
        }
      }
    }

    analyzedLinks.push({ url, host, issues });

    // Add flags
    if (issues.length > 0 && !flagTypes.has('suspicious_link')) {
      flags.push({
        type: 'suspicious_link',
        span: findSpan(text, url),
        why: `Suspicious link detected: ${issues.join(', ')}`
      });
      flagTypes.add('suspicious_link');
    }
  }

  // Inspect every external link: adding a genuine link must not hide a fake one.
  if (brand && analyzedLinks.length > 0 && !flagTypes.has('brand_link_mismatch')) {
    const officialDomains = officialDomainsFor(brand.id);
    if (officialDomains.length > 0) {
      const hasMismatch = analyzedLinks.some(link => !officialDomains.some(od =>
        link.host === od || link.host.endsWith('.' + od)
      ));

      if (hasMismatch) {
        flags.push({
          type: 'brand_link_mismatch',
          span: null,
          why: `${brand.name} is mentioned but a link goes outside its known official domains`
        });
        flagTypes.add('brand_link_mismatch');
      }
    }
  }

  // Calculate score
  let score = 0;
  for (const flag of flags) {
    const weight = {
      suspicious_link: 25,
      brand_link_mismatch: 30
    }[flag.type] || 0;
    score += weight;
  }

  return { score, links: analyzedLinks, flags };
}

/**
 * Find the span of a substring in text
 */
function findSpan(text, sub) {
  const idx = text.indexOf(sub);
  if (idx === -1) return null;
  return [idx, idx + sub.length];
}
