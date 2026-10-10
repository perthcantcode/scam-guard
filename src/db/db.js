/** Scam Guard — Database (Dexie/IndexedDB) */

import Dexie from 'dexie';
import { toDayKey } from './dayKey.js';
import { CHANNELS, FAMILIES } from '../engine/config.js';

const VERDICTS = ['scam', 'suspicious', 'likely_ok'];
const INPUT_TYPES = ['paste', 'ocr', 'share'];
const MAX_BACKUP_CHARS = 5 * 1024 * 1024;
const MAX_BACKUP_CHECKS = 20000;

const db = new Dexie('ScamGuard');

db.version(1).stores({
  checks: '++id, ts, dayKey, channel, brand, family, verdict, demo',
  vectors: 'key',
  settings: 'key'
});

/**
 * Log a check to the database
 * @param {Object} result - Analysis result from the pipeline
 * @param {Object} options
 * @param {string} options.inputType - 'paste' | 'ocr' | 'share'
 * @param {string} options.text - Original text (only stored if saveMessages is on)
 * @param {number} [options.demo=0] - 1 if demo data
 * @returns {Promise<number>} - The new check's ID
 */
export async function logCheck(result, { inputType, text, demo = 0 } = {}) {
  const ts = Date.now();
  const dayKey = toDayKey(ts);

  let textHash = null;
  try {
    if (typeof text === 'string' && text && globalThis.crypto?.subtle) {
      const buf = new TextEncoder().encode(text);
      const hashBuf = await crypto.subtle.digest('SHA-256', buf);
      textHash = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch { /* ignore */ }

  const saveMessages = await getSetting('saveMessages', false);

  const record = metadataRecord({
    ts,
    dayKey,
    channel: result.channel || 'other',
    brand: result.brand || null,
    family: result.family || 'unknown',
    verdict: result.verdict,
    score: result.score,
    flags: (result.flags || []).map(f => typeof f === 'string' ? f : f.type),
    inputType: inputType || 'paste',
    textHash,
    demo: demo ? 1 : 0
  });

  if (saveMessages === true && typeof text === 'string' && text) {
    record.text = text;
  }

  return db.checks.add(record);
}

/**
 * Get a setting value
 * @param {string} key
 * @param {*} defaultValue
 * @returns {Promise<*>}
 */
export async function getSetting(key, defaultValue) {
  try {
    const row = await db.settings.get(key);
    return row !== undefined ? row.value : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Set a setting value
 * @param {string} key
 * @param {*} value
 */
export async function setSetting(key, value) {
  await db.settings.put({ key, value });
}

/**
 * Get checks in [startTs, endTs); includes checks at the start of a local day.
 * @param {number} startTs
 * @param {number} endTs
 * @returns {Promise<Array>}
 */
export async function getChecksBetween(startTs, endTs) {
  return db.checks.where('ts').between(startTs, endTs, true, false).toArray();
}

/**
 * Get all checks
 * @returns {Promise<Array>}
 */
export async function getAllChecks() {
  return db.checks.toArray();
}

/**
 * Get recent checks (last N)
 * @param {number} n
 * @returns {Promise<Array>}
 */
export async function getRecentChecks(n = 10) {
  return db.checks.orderBy('ts').reverse().limit(n).toArray();
}

/**
 * Delete all checks
 */
export async function deleteAllChecks() {
  await db.checks.clear();
}

/**
 * Delete only demo checks
 */
export async function deleteDemoChecks() {
  await db.checks.where('demo').equals(1).delete();
}

/**
 * Check if demo data exists
 * @returns {Promise<boolean>}
 */
export async function hasDemoData() {
  const count = await db.checks.where('demo').equals(1).count();
  return count > 0;
}

/**
 * Export check metadata only. Messages and device preferences never leave through backups.
 * @returns {Promise<string>}
 */
export async function exportJSON() {
  const checks = await db.checks.toArray();
  return JSON.stringify({ version: 1, checks: checks.map(metadataRecord) }, null, 2);
}

/**
 * Validate every record, then append new metadata without replacing history or settings.
 * Reimporting a backup is idempotent. Record IDs are device-local and are never trusted.
 * @param {string} jsonStr
 * @returns {Promise<number>} Number of newly imported checks.
 */
export async function importJSON(jsonStr) {
  try {
    const checks = parseBackup(jsonStr);
    return await db.transaction('rw', db.checks, async () => {
      const existing = await db.checks.toArray();
      const identities = new Set(existing.map(recordIdentity));
      const newChecks = [];
      for (const check of checks) {
        const identity = recordIdentity(check);
        if (!identities.has(identity)) {
          newChecks.push(check);
          identities.add(identity);
        }
      }
      await db.checks.bulkAdd(newChecks);
      return newChecks.length;
    });
  } catch (err) {
    throw new Error('Import failed: ' + err.message);
  }
}

/**
 * Parse a portable metadata backup. Legacy settings/text fields are deliberately discarded.
 * @param {string} jsonStr
 * @returns {Array<Object>} Validated check metadata, using the current local timezone.
 */
export function parseBackup(jsonStr) {
  if (typeof jsonStr !== 'string' || jsonStr.length > MAX_BACKUP_CHARS) {
    throw new Error('Choose a JSON backup smaller than 5 MB.');
  }
  const data = JSON.parse(jsonStr);
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== 1 ||
      !Array.isArray(data.checks) || data.checks.length > MAX_BACKUP_CHECKS) {
    throw new Error('Expected a Scam Guard version 1 backup with at most 20,000 checks.');
  }
  return data.checks.map(metadataRecord);
}

function metadataRecord(check) {
  if (!check || typeof check !== 'object' || Array.isArray(check) ||
      !Number.isSafeInteger(check.ts) || check.ts < 0 || !Number.isFinite(new Date(check.ts).getTime()) ||
      !VERDICTS.includes(check.verdict) || !CHANNELS.includes(check.channel) ||
      !FAMILIES.includes(check.family) || !INPUT_TYPES.includes(check.inputType) ||
      !Number.isFinite(check.score) || check.score < 0 || check.score > 100 ||
      ![0, 1].includes(check.demo) ||
      !(check.brand === null || (typeof check.brand === 'string' && check.brand.length <= 80)) ||
      !Array.isArray(check.flags) || check.flags.length > 30 ||
      !check.flags.every(flag => typeof flag === 'string' && /^[a-z][a-z0-9_]{0,49}$/.test(flag)) ||
      !(check.textHash === null || (typeof check.textHash === 'string' && /^[a-f0-9]{64}$/.test(check.textHash)))) {
    throw new Error('Invalid check record. The backup has not been imported.');
  }
  return {
    ts: check.ts,
    dayKey: toDayKey(check.ts),
    channel: check.channel,
    brand: check.brand,
    family: check.family,
    verdict: check.verdict,
    score: check.score,
    flags: [...new Set(check.flags)],
    inputType: check.inputType,
    textHash: check.textHash,
    demo: check.demo
  };
}

function recordIdentity(check) {
  return JSON.stringify([
    check.ts, check.textHash ?? null, check.channel, check.brand ?? null,
    check.family, check.verdict, check.score, check.inputType, check.demo
  ]);
}

export { db };
