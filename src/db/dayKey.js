/** Scam Guard — Date/Day Key Utilities */

/**
 * Convert a timestamp to a day key in LOCAL time (YYYY-MM-DD)
 * @param {number} ts - Unix timestamp in ms
 * @returns {string}
 */
export function toDayKey(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Get the start of the week (Sunday) for a date
 * @param {Date} date
 * @returns {Date}
 */
export function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Add days to a date
 * @param {Date} date
 * @param {number} n
 * @returns {Date}
 */
export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Days between two dates
 * @param {Date} a
 * @param {Date} b
 * @returns {number}
 */
export function daysBetween(a, b) {
  // Calendar days, not elapsed 24-hour periods (DST days can be 23 or 25 hours).
  const first = new Date(a);
  const second = new Date(b);
  const firstDay = Date.UTC(first.getFullYear(), first.getMonth(), first.getDate());
  const secondDay = Date.UTC(second.getFullYear(), second.getMonth(), second.getDate());
  return Math.abs(secondDay - firstDay) / 86400000;
}
