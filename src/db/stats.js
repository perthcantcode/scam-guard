/** Scam Guard — Statistics Functions */

import { toDayKey, startOfWeek, addDays, daysBetween } from './dayKey.js';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Overall totals from checks. Scams counts only verdict === 'scam'.
 * @param {Array} checks
 * @returns {{ checked: number, scams: number, suspicious: number, scamRate: string }}
 */
export function totals(checks) {
  const checked = checks.length;
  const scams = checks.filter(c => c.verdict === 'scam').length;
  const suspicious = checks.filter(c => c.verdict === 'suspicious').length;
  const scamRate = checked > 0 ? ((scams / checked) * 100).toFixed(0) + '%' : '0%';
  return { checked, scams, suspicious, scamRate };
}

/**
 * Top item by count
 */
function topBy(checks, field) {
  const counts = new Map();
  for (const c of checks) {
    const val = c[field];
    if (val && val !== 'unknown' && val !== 'other' && val !== null) {
      counts.set(val, (counts.get(val) || 0) + 1);
    }
  }
  let best = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best ? { key: best, count: bestCount } : null;
}

/**
 * Top scam family
 * @param {Array} checks
 * @returns {{key: string, count: number}|null}
 */
export function topFamily(checks) {
  return topBy(checks.filter(c => c.verdict === 'scam' || c.verdict === 'suspicious'), 'family');
}

/**
 * Top channel
 * @param {Array} checks
 * @returns {{key: string, count: number}|null}
 */
export function topChannel(checks) {
  return topBy(checks, 'channel');
}

/**
 * Top brand
 * @param {Array} checks
 * @returns {{key: string, count: number}|null}
 */
export function topBrand(checks) {
  return topBy(checks.filter(c => c.brand), 'brand');
}

/**
 * Days without flagged checks, bounded by the first recorded check. Empty history is 0.
 * @param {Array} checks
 * @param {Date} [now]
 * @returns {number}
 */
export function scamFreeStreak(checks, now = new Date()) {
  const history = checks.filter(c => Number.isFinite(c.ts) && c.ts <= now.getTime());
  if (history.length === 0) return 0;
  const oldest = new Date(Math.min(...history.map(c => c.ts)));
  const historyDays = daysBetween(oldest, now) + 1;
  const scamDays = new Set();

  for (const c of history) {
    if (c.verdict === 'scam' || c.verdict === 'suspicious') {
      scamDays.add(c.dayKey);
    }
  }

  let streak = 0;
  let d = new Date(now);
  d.setHours(0, 0, 0, 0);

  for (let i = 0; i < historyDays; i++) {
    const dk = toDayKey(d.getTime());
    if (scamDays.has(dk)) break;
    streak++;
    d = addDays(d, -1);
  }

  return streak;
}

/**
 * Busiest weekday
 * @param {Array} checks
 * @returns {{weekday: number, name: string, count: number}|null}
 */
export function busiestWeekday(checks) {
  if (checks.length === 0) return null;

  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const c of checks) {
    const d = new Date(c.ts);
    counts[d.getDay()]++;
  }

  let maxIdx = 0;
  for (let i = 1; i < 7; i++) {
    if (counts[i] > counts[maxIdx]) maxIdx = i;
  }

  return { weekday: maxIdx, name: WEEKDAY_NAMES[maxIdx], count: counts[maxIdx] };
}

/**
 * Weekly summary for the current Sun-Sat week
 * @param {Array} checks
 * @param {Date} [now]
 * @returns {{ checked: number, scams: number, topFamily: {key,count}|null, topChannel: {key,count}|null }}
 */
export function weeklySummary(checks, now = new Date()) {
  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 7);
  const startTs = weekStart.getTime();
  const endTs = weekEnd.getTime();

  const weekChecks = checks.filter(c => c.ts >= startTs && c.ts < endTs && c.ts <= now.getTime());
  const t = totals(weekChecks);

  return {
    checked: t.checked,
    scams: t.scams,
    topFamily: topFamily(weekChecks),
    topChannel: topChannel(weekChecks)
  };
}

/**
 * Compare this week's scam verdicts to all eight previous weeks (including quiet weeks).
 * With no checks in that history, return Low; with a zero scam baseline, any scam is High.
 * @param {Array} checks
 * @param {Date} [now]
 * @returns {'Low'|'Medium'|'High'}
 */
export function targetedLevel(checks, now = new Date()) {
  const weekStart = startOfWeek(now);
  const thisWeekStart = weekStart.getTime();
  const thisWeekEnd = addDays(weekStart, 7).getTime();

  const thisWeekScams = checks.filter(
    c => c.ts >= thisWeekStart && c.ts < thisWeekEnd && c.ts <= now.getTime() &&
    c.verdict === 'scam'
  ).length;

  // Previous 8 weeks
  const prevWeekCounts = [];
  for (let w = 1; w <= 8; w++) {
    const wStart = addDays(weekStart, -7 * w).getTime();
    const wEnd = addDays(weekStart, -7 * (w - 1)).getTime();
    const count = checks.filter(
      c => c.ts >= wStart && c.ts < wEnd &&
      c.verdict === 'scam'
    ).length;
    prevWeekCounts.push(count);
  }

  const historyStart = addDays(weekStart, -56).getTime();
  if (!checks.some(c => c.ts >= historyStart && c.ts < thisWeekStart)) return 'Low';
  const mean = prevWeekCounts.reduce((a, b) => a + b, 0) / 8;
  if (mean === 0) return thisWeekScams > 0 ? 'High' : 'Low';

  if (thisWeekScams > 1.5 * mean) return 'High';
  if (thisWeekScams < 0.75 * mean) return 'Low';
  return 'Medium';
}

/**
 * Generate an insight line from counts
 * @param {Array} checks
 * @returns {string}
 */
export function insightLine(checks) {
  const scamChecks = checks.filter(c => c.verdict === 'scam' || c.verdict === 'suspicious');
  if (scamChecks.length < 3) return '';

  const tc = topChannel(scamChecks);
  const tf = topFamily(scamChecks);

  if (tc && tf) {
    return `Your flagged checks mostly arrive via ${tc.key.toUpperCase()}, and ${formatFamily(tf.key)} is the most common pattern.`;
  }
  if (tc) {
    return `Most flagged messages reach you via ${tc.key.toUpperCase()}.`;
  }
  if (tf) {
    return `${formatFamily(tf.key)} is the most common pattern in your flagged checks.`;
  }
  return '';
}

function formatFamily(family) {
  return family.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Heatmap data: 53 weeks x 7 days
 * @param {Array} checks
 * @param {Object} options
 * @param {'scams'|'all'} [options.metric='scams']
 * @param {Date} [options.now]
 * @returns {{ weeks: Array, months: Array }}
 */
export function heatmapData(checks, { metric = 'scams', now = new Date() } = {}) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayDk = toDayKey(today.getTime());

  // Group checks by dayKey
  const byDay = new Map();
  for (const c of checks) {
    if (metric === 'scams' && c.verdict !== 'scam' && c.verdict !== 'suspicious') continue;
    if (!byDay.has(c.dayKey)) byDay.set(c.dayKey, []);
    byDay.get(c.dayKey).push({
      family: c.family,
      channel: c.channel,
      brand: c.brand,
      verdict: c.verdict
    });
  }

  // Build 53 weeks ending on this week
  const currentWeekStart = startOfWeek(today);
  const gridStart = addDays(currentWeekStart, -52 * 7);

  const weeks = [];
  const months = [];
  let lastMonth = -1;

  for (let w = 0; w < 53; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = addDays(gridStart, w * 7 + d);
      const dk = toDayKey(cellDate.getTime());
      const future = dk > todayDk;
      const items = future ? [] : (byDay.get(dk) || []);
      const count = items.length;

      let level = 0;
      if (!future) {
        if (count === 0) level = 0;
        else if (count === 1) level = 1;
        else if (count <= 3) level = 2;
        else if (count <= 5) level = 3;
        else level = 4;
      }

      week.push({ dayKey: dk, date: cellDate, count, level, items, future });

      // Track month labels
      const month = cellDate.getMonth();
      if (d === 0 && month !== lastMonth) {
        months.push({
          label: cellDate.toLocaleString('default', { month: 'short' }),
          weekIndex: w
        });
        lastMonth = month;
      }
    }
    weeks.push(week);
  }

  return { weeks, months };
}

/**
 * Breakdown by field
 * @param {Array} checks
 * @param {'channel'|'family'|'brand'} field
 * @returns {Array<{key: string, count: number}>}
 */
export function breakdown(checks, field) {
  if (!['channel', 'family', 'brand'].includes(field)) return [];
  const scamChecks = checks.filter(c => c.verdict === 'scam' || c.verdict === 'suspicious');
  const counts = new Map();
  for (const c of scamChecks) {
    const val = c[field];
    if (val && val !== 'unknown' && val !== null) {
      counts.set(val, (counts.get(val) || 0) + 1);
    }
  }
  return Array.from(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}
