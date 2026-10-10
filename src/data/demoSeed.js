/** Scam Guard — Demo Data Seed */

import { db, deleteDemoChecks } from '../db/db.js';
import { toDayKey, addDays } from '../db/dayKey.js';

const FAMILIES = ['parcel_fee', 'parcel_fee', 'parcel_fee', 'prize_scam', 'prize_scam', 'prize_scam',
  'fake_job', 'account_phishing',
  'investment_romance', 'lending_harassment', 'impersonation_relative', 'fake_ayuda'];

const BRANDS = ['GCash', 'Maya', 'BDO', 'BPI', 'Shopee', 'Lazada', 'Globe', 'J&T Express', null, null];

/** Mulberry32 deterministic PRNG */
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Seed demo data (~180 days of realistic fake history)
 * All rows have demo:1. Replaces only earlier demo rows; real history stays intact.
 * @returns {Promise<number>} Number of demo records loaded.
 */
export async function seedDemo() {
  const records = generateDemoChecks();
  await db.transaction('rw', db.checks, async () => {
    await db.checks.where('demo').equals(1).delete();
    await db.checks.bulkAdd(records);
  });
  return records.length;
}

/**
 * Build deterministic sample metadata for the previous 180 complete local calendar days.
 * @param {Date} [now] Reference date; no demo check is placed in the future.
 * @returns {Array<Object>} Synthetic metadata only; no messages or personal information.
 */
export function generateDemoChecks(now = new Date()) {
  const rng = mulberry32(42);
  const referenceDate = new Date(now);
  referenceDate.setHours(12, 0, 0, 0);

  const records = [];

  // Go back ~180 days
  for (let dayOffset = -180; dayOffset < 0; dayOffset++) {
    const date = addDays(referenceDate, dayOffset);
    const dayOfWeek = date.getDay();
    const dk = toDayKey(date.getTime());

    // More scams on weekends, some quiet days
    let maxChecks;
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      maxChecks = rng() < 0.3 ? 0 : Math.floor(rng() * 5) + 1;
    } else {
      maxChecks = rng() < 0.4 ? 0 : Math.floor(rng() * 3);
    }

    // One "busy week" around day -60
    if (dayOffset >= -65 && dayOffset <= -58) {
      maxChecks = Math.floor(rng() * 6) + 2;
    }

    // Quiet period around day -120
    if (dayOffset >= -125 && dayOffset <= -115) {
      maxChecks = rng() < 0.7 ? 0 : 1;
    }

    for (let i = 0; i < maxChecks; i++) {
      const isScam = rng() > 0.15; // 85% scams in the seed
      const verdict = isScam ? (rng() > 0.3 ? 'scam' : 'suspicious') : 'likely_ok';
      const family = isScam ? FAMILIES[Math.floor(rng() * FAMILIES.length)] : 'unknown';

      // Weight SMS higher
      let channel;
      const channelRoll = rng();
      if (channelRoll < 0.4) channel = 'sms';
      else if (channelRoll < 0.65) channel = 'messenger';
      else if (channelRoll < 0.75) channel = 'telegram';
      else if (channelRoll < 0.85) channel = 'viber';
      else if (channelRoll < 0.93) channel = 'email';
      else channel = 'whatsapp';

      const brand = isScam ? BRANDS[Math.floor(rng() * BRANDS.length)] : null;
      const score = verdict === 'scam'
        ? Math.floor(rng() * 31) + 70
        : verdict === 'suspicious' ? Math.floor(rng() * 30) + 40 : Math.floor(rng() * 40);

      // Random time during the day
      const hours = Math.floor(rng() * 14) + 8; // 8am - 10pm
      const minutes = Math.floor(rng() * 60);
      const ts = new Date(date);
      ts.setHours(hours, minutes, Math.floor(rng() * 60), 0);

      records.push({
        ts: ts.getTime(),
        dayKey: dk,
        channel,
        brand,
        family,
        verdict,
        score,
        flags: isScam ? ['urgency', 'money_request'] : [],
        inputType: 'paste',
        textHash: null,
        demo: 1
      });
    }
  }

  return records;
}

/**
 * Remove only demo data
 * @returns {Promise<void>}
 */
export async function clearDemo() {
  await deleteDemoChecks();
}
