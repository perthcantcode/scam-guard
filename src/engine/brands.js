/** Scam Guard — Brand Detection Module */

import brandsData from '../data/brands.json' with { type: 'json' };

/**
 * Find a brand mentioned in text
 * @param {string} text - Input text to scan
 * @returns {{id: string, name: string}|null}
 */
export function findBrand(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');

  let bestMatch = null;
  let bestLen = 0;

  for (const brand of brandsData) {
    for (const alias of brand.aliases) {
      const normalAlias = alias.toLowerCase().replace(/[-_]/g, ' ');
      const escaped = normalAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(lower) && normalAlias.length > bestLen) {
        bestMatch = { id: brand.id, name: brand.name };
        bestLen = normalAlias.length;
      }
    }
  }

  return bestMatch;
}

/**
 * Get official domains for a brand
 * @param {string} brandId
 * @returns {string[]}
 */
export function officialDomainsFor(brandId) {
  const brand = brandsData.find(b => b.id === brandId);
  if (!brand || !brand.verified) return [];
  return brand.officialDomains || [];
}

/**
 * Get all brands data
 * @returns {Array}
 */
export function getAllBrands() {
  return brandsData;
}
