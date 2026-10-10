import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRules } from '../rules.js';
import { analyzeLinks, extractUrls } from '../links.js';
import { findBrand } from '../brands.js';
import { analyze } from '../pipeline.js';
import { cleanOCRText, extractText } from '../ocr.js';
import embedClient from '../embedClient.js';

const has = (text, type) => analyzeRules(text).flags.some(flag => flag.type === type);

test('credential requests respect clause-local negations and cannot hide behind warnings', () => {
  for (const text of [
    'Send me your OTP.', 'Please reply with your MPIN.', 'Ibigay ang iyong OTP ngayon.',
    'Never share your OTP. Now send your OTP to support.',
    'Do not share your password, but enter your OTP here.',
    'Huwag ibigay ang OTP. Pero ipadala ang PIN sa amin.',
    'Do not share your OTP; send me your password.',
    'Do not share your OTP and send me your password.'
  ]) assert.equal(has(text, 'asks_otp'), true, text);
  for (const text of [
    'Your OTP is 123456. Never share your OTP.', 'Huwag ibigay ang OTP kahit kanino.',
    'Do not disclose your password.', 'Never send your PIN.', 'Your shipment is on the way.',
    'Use this discount code at checkout.', 'We will never ask you to provide your password.'
  ]) assert.equal(has(text, 'asks_otp'), false, text);
});

test('rule signals count once and use original-text spans', () => {
  const text = '🔐 Please send your OTP. Send your OTP right now!';
  const result = analyzeRules(text);
  assert.equal(result.flags.filter(flag => flag.type === 'asks_otp').length, 1);
  for (const flag of result.flags) assert.ok(text.slice(...flag.span).length > 0);
  assert.equal(text.slice(...result.flags.find(flag => flag.type === 'asks_otp').span), 'OTP');
});

test('ordinary peso amounts and recruiting are not prize claims', () => {
  assert.equal(has('Your payment of P5,000 was received.', 'prize_or_job_claim'), false);
  assert.equal(has('We are hiring engineers. Apply through our website.', 'prize_or_job_claim'), false);
  assert.equal(has('Work from home! Earn P5000/day, no experience needed.', 'prize_or_job_claim'), true);
});

test('links parse actual host and do not let a real domain hide an imitation', () => {
  for (const link of [
    'https://gcash.com@evil.example/login', 'http://192.168.1.2/pay',
    'https://gcash.com.evil.example', 'g-cash.app/verify', 'https://xn--gcash-abc.xyz'
  ]) assert.ok(analyzeLinks(`GCash: ${link}`).flags.some(flag => flag.type === 'suspicious_link'), link);
  assert.equal(analyzeLinks('GCash https://help.gcash.com/articles').score, 0);
  assert.equal(analyzeLinks('BDO HTTPS://www.bdo.com.ph/help').score, 0);
  assert.ok(analyzeLinks('GCash https://gcash.com and https://gcash-verify.xyz').flags.some(flag => flag.type === 'brand_link_mismatch'));
  assert.deepEqual(extractUrls('Email help@example.com for assistance.'), []);
  assert.deepEqual(extractUrls('Read https://example.com/test.'), ['https://example.com/test']);
});

test('brand matching uses word boundaries', () => {
  assert.equal(findBrand('A smartly written note is metadata.'), null);
  assert.equal(findBrand('Check G-Cash.').id, 'gcash');
});

const scamCases = [
  'Send your OTP to receive your refund.',
  'GCash account suspended. Visit gcash-verify.xyz now.',
  'You won a cash prize. Pay the claim fee right now.',
  'Work from home. No experience needed. Pay a registration fee to start.',
  'Nanalo ka! Magbayad ng processing fee agad.',
  'Your parcel is held. Pay the delivery fee at parcel-release.xyz.',
  'Guaranteed returns on crypto. Send money now to invest.',
  'Mama this is my new number. Send money right now.',
  'Your loan is overdue. Send money immediately or we will contact your family.',
  'Napili ka para sa ayuda. Magbayad ng registration fee ngayon na.',
  'BPI security: enter your PIN to reactivate your account.',
  'Never share your OTP. Send your OTP to us to verify your account.'
];
const legitCases = [
  'Your OTP is 987654. Never share your OTP.',
  'Your payment of P5000 was received. Thank you.',
  'Your package is out for delivery. No extra fee is required.',
  'Hiring engineers for our team. Apply through our careers page.',
  'Huwag ibigay ang iyong PIN o OTP kahit kanino.',
  'GCash: check your transaction history in your app.',
  'BDO: your statement is ready at https://www.bdo.com.ph.',
  'Job interview on Monday. We do not charge a registration fee.',
  'Mama, I will be home at six. Call me later.',
  'Investment returns are not guaranteed. Read the prospectus.',
  'Government aid applications are open. There is no processing fee.',
  'Your shipping fee of P50 is included in the receipt.'
];

test('rules-only pipeline detects twelve synthetic scam examples and accepts twelve controls', async () => {
  for (const text of scamCases) {
    const result = await analyze(text);
    assert.notEqual(result.verdict, 'likely_ok', `${result.score}: ${text}`);
    assert.equal(result.device, 'rules-only');
    assert.ok(result.score >= 40 && result.score <= 100);
  }
  for (const text of legitCases) {
    const result = await analyze(text);
    assert.equal(result.verdict, 'likely_ok', `${result.score}: ${text}`);
  }
});

test('empty and malformed input return valid results without throwing', async () => {
  for (const input of [null, undefined, {}, 17, '', '  ', '🙂'.repeat(5000)]) {
    const result = await analyze(input);
    assert.ok(Number.isFinite(result.score));
    assert.equal(typeof result.timings.rulesMs, 'number');
    assert.ok(Array.isArray(result.flags));
    assert.ok(Array.isArray(analyzeLinks(input).links));
    assert.ok(Array.isArray(analyzeRules(input).flags));
  }
});

test('AI failure preserves the complete rule score and legitimate similarity suppresses semantic-only alarms', async () => {
  const previous = { status: embedClient.status, classify: embedClient.classify };
  try {
    embedClient.status = 'ready';
    embedClient.classify = async () => { throw new Error('test timeout'); };
    const result = await analyze('You won a cash prize. Pay the claim fee right now.');
    assert.equal(result.score, 60);
    assert.equal(result.device, 'rules-only');
    assert.equal(result.modelNote, 'test timeout');
    embedClient.classify = async () => ({ family: 'account_phishing', similarity: .85, benignSimilarity: .91, device: 'wasm', ms: 15 });
    assert.equal((await analyze('Your OTP is 123456. Never share your OTP.')).score, 0);
    assert.ok((await analyze('Send me your OTP.')).score >= 85);
  } finally { Object.assign(embedClient, previous); }
});

test('OCR rejects unsupported and oversized files, and preserves line breaks', async () => {
  assert.ok((await extractText({ type: 'application/pdf', size: 100 })).error);
  assert.ok((await extractText({ type: 'image/png', size: 9 * 1024 * 1024 })).error);
  assert.equal(cleanOCRText('  Hello   there \n  Second line  '), 'Hello there\nSecond line');
});
