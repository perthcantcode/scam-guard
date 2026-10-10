/** Scam Guard — Analysis Pipeline */

import { analyzeRules } from './rules.js';
import { analyzeLinks } from './links.js';
import { findBrand } from './brands.js';
import { buildExplanation } from './explain.js';
import embedClient from './embedClient.js';
import { BANDS, SIM_LOW, SIM_HIGH } from './config.js';

/**
 * Main analysis pipeline
 * @param {string} text - The message text
 * @param {Object} [options]
 * @param {string} [options.channel='sms']
 * @param {string} [options.inputType='paste']
 * @returns {Promise<Object>} - Result matching the schema
 */
export async function analyze(text, { channel = 'sms', inputType = 'paste' } = {}) {
  try {
    // Validate input
    if (!text || typeof text !== 'string') {
      return makeResult({
        verdict: 'likely_ok',
        score: 0,
        explanation: { en: 'Nothing to check.', tl: 'Walang i-che-check.' },
        channel,
        device: 'rules-only'
      });
    }

    text = text.trim().substring(0, 4000);
    if (text.length === 0) {
      return makeResult({
        verdict: 'likely_ok',
        score: 0,
        explanation: { en: 'Nothing to check.', tl: 'Walang i-che-check.' },
        channel,
        device: 'rules-only'
      });
    }

    // Step 1: Rules + Links
    const rulesStart = performance.now();
    const rulesResult = analyzeRules(text, { channel });
    const linksResult = analyzeLinks(text);
    const rulesMs = Math.round(performance.now() - rulesStart);

    // Combine flags
    const allFlags = [...rulesResult.flags, ...linksResult.flags];
    const rulesScore = Math.min(100, rulesResult.score + linksResult.score);

    // Step 2: Embeddings (if ready)
    let simScore = 0;
    let embedMs = null;
    let embedFamily = null;
    let embedConfidence = 0;
    let device = 'rules-only';
    let modelNote = null;

    if (embedClient.status === 'ready') {
      try {
        const embedResult = await embedClient.classify(text);

        embedMs = embedResult.ms;
        device = embedResult.device;
        const hasScamMargin = embedResult.similarity - (embedResult.benignSimilarity ?? 0) >= 0.05;
        embedFamily = hasScamMargin ? embedResult.family : null;
        embedConfidence = hasScamMargin ? embedResult.similarity : 0;

        // Convert similarity to 0-100 score
        const clampedSim = Math.max(0, Math.min(1, (embedResult.similarity - SIM_LOW) / (SIM_HIGH - SIM_LOW)));
        simScore = hasScamMargin ? Math.round(clampedSim * 100) : 0;
        if (simScore >= 40) allFlags.push({
          type: 'pattern_similarity', span: null,
          why: 'Resembles an example in the local scam library. Similarity alone does not confirm fraud.'
        });
      } catch (error) {
        modelNote = error.message;
        // Continue rules-only
      }
    }

    // Step 3: Final score
    const maxScore = Math.max(rulesScore, simScore);
    const minScore = Math.min(rulesScore, simScore);
    // An absent model (or a weak semantic match) must not dilute concrete evidence.
    let finalScore = Math.max(rulesScore, Math.round(0.7 * maxScore + 0.3 * minScore));

    // OTP override
    if (allFlags.some(f => f.type === 'asks_otp')) {
      finalScore = Math.max(finalScore, 85);
    }

    // Step 4: Determine family
    let family = 'unknown';
    let familyConfidence = 0;

    if (embedFamily && embedConfidence >= SIM_LOW + 0.1) {
      family = embedFamily;
      familyConfidence = embedConfidence;
    } else {
      family = inferFamilyFromFlags(allFlags, text);
    }

    // Step 5: Verdict
    let verdict;
    if (finalScore >= BANDS.SCAM) {
      verdict = 'scam';
    } else if (finalScore >= BANDS.SUSPICIOUS) {
      verdict = 'suspicious';
    } else {
      verdict = 'likely_ok';
    }

    // Step 6: Brand
    const brand = findBrand(text);

    // Step 7: Explanation
    const result = {
      verdict,
      score: finalScore,
      family,
      familyConfidence,
      brand: brand ? brand.name : null,
      channel,
      flags: allFlags,
      links: linksResult.links,
      explanation: null,
      timings: { rulesMs, embedMs, ocrMs: null },
      device,
      modelNote
    };

    result.explanation = buildExplanation(result);

    return result;
  } catch (err) {
    console.error('Pipeline error:', err);
    return makeResult({
      verdict: 'suspicious',
      score: 40,
      analysisFailed: true,
      explanation: {
        en: 'This check could not finish, so the message has not been assessed. Please try again.',
        tl: 'Nagkaroon ng error sa pag-analyze. Pakisubukan ulit.'
      },
      channel,
      device: 'rules-only'
    });
  }
}

/**
 * Infer scam family from flags and text
 */
function inferFamilyFromFlags(flags, text) {
  const flagTypes = new Set(flags.map(f => f.type));
  const lower = text.toLowerCase();
  if (![...flagTypes].some(type => type !== 'warning_context')) return 'unknown';
  if (/\b(?:ayuda|subsidy|government|gobyerno)\b/.test(lower)) return 'fake_ayuda';
  if (flagTypes.has('asks_otp')) return 'account_phishing';

  // Job-related
  if (flagTypes.has('prize_or_job_claim')) {
    const jobWords = ['hiring', 'job', 'work from home', 'apply', 'salary', 'per day', 'income', 'sideline', 'homebased'];
    if (jobWords.some(w => lower.includes(w))) return 'fake_job';

    const prizeWords = ['congratulations', 'nanalo', 'winner', 'prize', 'raffle', 'giveaway', 'reward', 'napili'];
    if (prizeWords.some(w => lower.includes(w))) return 'prize_scam';
  }

  // Parcel
  if (lower.includes('parcel') || lower.includes('delivery') || lower.includes('courier') ||
      lower.includes('package') || lower.includes('padala')) {
    if (flagTypes.has('money_request')) return 'parcel_fee';
  }

  // Account phishing
  if (flagTypes.has('threat_account') && (flagTypes.has('suspicious_link') || flagTypes.has('asks_otp'))) {
    return 'account_phishing';
  }

  // Lending harassment
  if (lower.includes('utang') || lower.includes('loan') || lower.includes('lending') ||
      lower.includes('bayaran') || lower.includes('overdue')) {
    return 'lending_harassment';
  }

  // Impersonation
  if (lower.includes('mama') || lower.includes('papa') || lower.includes('anak') ||
      lower.includes('new number') || lower.includes('bagong number') || lower.includes('new sim')) {
    return 'impersonation_relative';
  }

  // Government aid
  if (lower.includes('ayuda') || lower.includes('subsidy') || lower.includes('sss') ||
      lower.includes('pagibig') || lower.includes('government') || lower.includes('gobyerno')) {
    return 'fake_ayuda';
  }

  // Investment
  if (lower.includes('invest') || lower.includes('crypto') || lower.includes('bitcoin') ||
      lower.includes('forex') || lower.includes('trading')) {
    return 'investment_romance';
  }

  return 'unknown';
}

/**
 * Create a safe default result
 */
function makeResult(overrides = {}) {
  return {
    verdict: 'likely_ok',
    score: 0,
    family: 'unknown',
    familyConfidence: 0,
    brand: null,
    channel: 'sms',
    flags: [],
    links: [],
    explanation: { en: '', tl: '' },
    timings: { rulesMs: 0, embedMs: null, ocrMs: null },
    device: 'rules-only',
    ...overrides
  };
}
