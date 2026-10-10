import test from 'node:test';
import assert from 'node:assert/strict';
import { toDayKey, addDays, startOfWeek, daysBetween } from './dayKey.js';
import { db, logCheck, parseBackup, importJSON, exportJSON, getChecksBetween } from './db.js';
import { totals, heatmapData, scamFreeStreak, targetedLevel } from './stats.js';
import { generateDemoChecks, seedDemo, clearDemo } from '../data/demoSeed.js';

const now = new Date(2026, 9, 10, 12);
function check(overrides = {}) {
  return {
    ts: now.getTime(), dayKey: toDayKey(now), channel: 'sms', brand: 'GCash',
    family: 'account_phishing', verdict: 'scam', score: 85, flags: ['asks_otp'],
    inputType: 'paste', textHash: null, demo: 0, ...overrides
  };
}
function onDay(offset, overrides = {}) {
  const date = addDays(now, offset);
  return check({ ts: date.getTime(), dayKey: toDayKey(date), ...overrides });
}

test('local dates keep messages on the correct side of midnight', () => {
  assert.equal(toDayKey(new Date(2026, 9, 10, 0, 0)), '2026-10-10');
  assert.equal(toDayKey(new Date(2026, 9, 9, 23, 59, 59)), '2026-10-09');
  assert.equal(toDayKey(startOfWeek(now)), '2026-10-04');
  assert.equal(daysBetween(new Date(2026, 9, 9, 23, 59), new Date(2026, 9, 10, 0, 1)), 1);
  assert.equal(daysBetween(new Date(2026, 9, 10, 0, 1), new Date(2026, 9, 10, 23, 59)), 0);
});

test('heatmap has 53 Sunday-start weeks, correct levels, and empty future cells', () => {
  const checks = [0, 1, 2, 4, 6].flatMap((count, index) =>
    Array.from({ length: count }, () => onDay(index - 4)));
  const grid = heatmapData(checks, { now });
  assert.equal(grid.weeks.length, 53);
  assert.ok(grid.weeks.every(week => week.length === 7 && week[0].date.getDay() === 0));
  const cells = grid.weeks.flat();
  for (let index = 0; index < 5; index++) {
    assert.equal(cells.find(cell => cell.dayKey === toDayKey(addDays(now, index - 4))).level, index);
  }
  const earlierNow = addDays(now, -3);
  const future = heatmapData([check()], { now: earlierNow }).weeks.flat().find(cell => cell.dayKey === toDayKey(now));
  assert.equal(future.future, true);
  assert.equal(future.count, 0);
  assert.deepEqual(future.items, []);
  assert.equal(heatmapData([check({ verdict: 'likely_ok' })], { now }).weeks.flat().at(-1).count, 0);
  assert.equal(heatmapData([check({ verdict: 'likely_ok' })], { now, metric: 'all' }).weeks.flat().at(-1).count, 1);
});

test('streak is bounded by actual history and breaks on suspicious checks', () => {
  assert.equal(scamFreeStreak([], now), 0);
  assert.equal(scamFreeStreak([check({ verdict: 'likely_ok' })], now), 1);
  assert.equal(scamFreeStreak([onDay(-2, { verdict: 'likely_ok' })], now), 3);
  assert.equal(scamFreeStreak([onDay(-2, { verdict: 'suspicious' }), onDay(-10)], now), 2);
  assert.equal(scamFreeStreak([check()], now), 0);
  assert.equal(scamFreeStreak([onDay(1)], now), 0);
});

test('targeted level retains quiet weeks and handles no-history/zero-baseline cases', () => {
  assert.equal(targetedLevel([], now), 'Low');
  assert.equal(targetedLevel([check()], now), 'Low');
  assert.equal(targetedLevel([onDay(-9), onDay(-9), onDay(-9), onDay(-9), check()], now), 'High');
  assert.equal(targetedLevel([onDay(-9, { verdict: 'likely_ok' }), check()], now), 'High');
  assert.equal(targetedLevel([onDay(-9, { verdict: 'likely_ok' })], now), 'Low');
  const history = Array.from({ length: 8 }, (_, index) => onDay(-7 * (index + 1)));
  assert.equal(targetedLevel([...history, check()], now), 'Medium');
  assert.equal(targetedLevel(history, now), 'Low');
  assert.deepEqual(totals([check(), check({ verdict: 'suspicious' })]), {
    checked: 2, scams: 1, suspicious: 1, scamRate: '50%'
  });
});

test('backups discard messages, IDs, settings, and unknown properties', () => {
  const record = check({ id: 99, text: 'private message', links: ['secret.example'], dayKey: '1999-01-01' });
  const parsed = parseBackup(JSON.stringify({ version: 1, checks: [record], settings: [{ key: 'saveMessages', value: true }] }));
  assert.deepEqual(parsed, [check()]);
});

test('invalid backups are rejected before writes', () => {
  for (const invalid of [null, [], {}, { version: 2, checks: [] }, { version: 1, checks: [check({ ts: 'yesterday' })] },
    { version: 1, checks: [check({ score: 101 })] }, { version: 1, checks: [check({ verdict: 'safe' })] },
    { version: 1, checks: [check({ demo: true })] }, { version: 1, checks: [check({ channel: '<script>' })] },
    { version: 1, checks: [check({ flags: [{ type: 'asks_otp', text: 'private' }] })] }]) {
    assert.throws(() => parseBackup(JSON.stringify(invalid)));
  }
});

test('logging stores only flag types and requires an explicit true to save text', async t => {
  const saved = [];
  t.mock.method(db.settings, 'get', async () => ({ value: 'true' }));
  t.mock.method(db.checks, 'add', async record => { saved.push(record); return 1; });
  await logCheck(check({ flags: [{ type: 'asks_otp', text: 'private', start: 0, end: 7 }] }), { text: 'private' });
  assert.equal(saved[0].text, undefined);
  assert.deepEqual(saved[0].flags, ['asks_otp']);
  assert.equal(saved[0].demo, 0);
  assert.match(saved[0].textHash, /^[a-f0-9]{64}$/);
  db.settings.get = async () => ({ value: true });
  await logCheck(check(), { text: 'opted in' });
  assert.equal(saved[1].text, 'opted in');
});

test('import merges and deduplicates without deleting real checks or changing settings', async t => {
  const existing = check();
  const second = onDay(-1);
  let added = [];
  t.mock.method(db, 'transaction', async (_mode, _table, callback) => callback());
  t.mock.method(db.checks, 'toArray', async () => [existing]);
  t.mock.method(db.checks, 'bulkAdd', async rows => { added = rows; });
  const count = await importJSON(JSON.stringify({ version: 1, checks: [existing, second, second] }));
  assert.equal(count, 1);
  assert.deepEqual(added, [second]);
});

test('export never includes a saved message or settings', async t => {
  t.mock.method(db.checks, 'toArray', async () => [check({ text: 'do not export me', id: 9 })]);
  assert.deepEqual(JSON.parse(await exportJSON()), { version: 1, checks: [check()] });
});

test('date queries include midnight but exclude the next period', async t => {
  let args;
  t.mock.method(db.checks, 'where', () => ({ between: (...values) => {
    args = values;
    return { toArray: async () => [] };
  } }));
  await getChecksBetween(100, 200);
  assert.deepEqual(args, [100, 200, true, false]);
});

test('demo history is deterministic, labeled, past-only, and scores match verdicts', () => {
  const records = generateDemoChecks(now);
  assert.deepEqual(records, generateDemoChecks(now));
  assert.ok(records.length > 150);
  assert.ok(records.every(row => row.demo === 1 && !('text' in row) && row.ts < now.getTime()));
  assert.ok(records.every(row => row.dayKey === toDayKey(row.ts)));
  assert.ok(records.every(row => row.verdict === (row.score >= 70 ? 'scam' : row.score >= 40 ? 'suspicious' : 'likely_ok')));
  const families = new Map();
  for (const row of records) families.set(row.family, (families.get(row.family) || 0) + 1);
  assert.deepEqual([...families].sort((a, b) => b[1] - a[1]).slice(0, 2).map(row => row[0]).sort(), ['parcel_fee', 'prize_scam']);
});

test('loading and clearing demos delete only demo rows', async t => {
  const deleted = [];
  t.mock.method(db, 'transaction', async (_mode, _table, callback) => callback());
  t.mock.method(db.checks, 'where', field => ({ equals: value => ({ delete: async () => deleted.push([field, value]) }) }));
  t.mock.method(db.checks, 'bulkAdd', async () => {});
  await seedDemo();
  await clearDemo();
  assert.deepEqual(deleted, [['demo', 1], ['demo', 1]]);
});
