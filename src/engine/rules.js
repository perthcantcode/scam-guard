/** Transparent, local heuristics. A risk score is not a probability. */
import { WEIGHTS } from './config.js';

const OTP_NOUN = /\b(?:otp|m?pin|password|passcode|verification code|security code|confirmation code|one[- ]time password|access code|auth code|[46][- ]digit code|kodigo)\b/gi;
const REQUEST_VERB = /\b(?:send|share|give|reply|provide|submit|enter|input|type|ibigay|ipadala|i-send|sabihin|mag-send|isend|ishare|bigay|paki-send|pakisend|pakibigay|text back|need your|kailangan ang|mag-reply|isulat)\b/gi;
const NEGATION = /(?:\b(?:never|not|no|don't|dont|do not|will not|won't|cannot|huwag|wag|hindi|without)\b|do\s+not)[^.!?;,:\n]{0,55}$/i;
const REQUEST_NEGATION = /\b(?:never|not|don't|dont|won't|huwag|wag|hindi)\s+(?:(?:ever|please|just|ask|need|want|tell|someone|you|us|them|anyone|to|namin|po|na|mo|will|be|required)\s+){0,6}$/i;
const URGENCY = /\b(?:urgent(?:ly)?|agad|ngayon na|within (?:24 hours|1 hour|the hour)|huling araw|last chance|immediate(?:ly)?|asap|right now|hurry|limited time|act now|today only|ngayong araw|before midnight|claim now|final warning|final notice)\b/gi;
const MONEY = /\b(?:processing fee|claim fee|registration fee|activation fee|shipping fee|delivery fee|insurance fee|tax fee|administrative fee|processing charge|send (?:money|load)|transfer (?:money|funds)|pay (?:first|now|the fee)|deposit (?:first|now|of|to)|magpadala ng|ipadala ang pera|magbayad|bayaran muna|pera muna|payment muna|padala muna|bayad muna)\b/gi;
const PRIZE = /\b(?:you (?:have )?(?:won|are (?:a |the )?winner)|nanalo|lucky winner|cash prize|claim (?:your |a )?(?:prize|reward)|napili ka|napiling manalo|guaranteed (?:returns?|income|profit)|double your money|doble ang pera)\b/gi;
const JOB = /\b(?:hiring|job|work from home|part[- ]time|daily income|kumita|sideline|homebased|home based)\b/i;
const JOB_BAIT = /\b(?:no experience|walang experience|easy money|daily payout|guaranteed|earn up to)\b|(?:₱|PHP?\s*)[\d,]+\s*(?:\/|per)\s*(?:day|araw)/i;
const THREAT = /\b(?:account (?:is |will be |has been )?(?:suspended|blocked|locked|deactivated)|na-lock|na-suspend|na-block|verify your account|i-verify|account verification|reactivate your|update your account|confirm your identity|expose your|contact your (?:family|employer)|ipapahiya)\b/gi;

// Scope negation to a clause. A safety sentence cannot hide a later request.
function clauses(text) {
  return [...text.matchAll(/[^.!?;,\n]+/g)].flatMap(match => {
    const result = [];
    let start = 0;
    for (const split of match[0].matchAll(/\b(?:but|however|pero|then)\b/gi)) {
      result.push({ text: match[0].slice(start, split.index), start: match.index + start });
      start = split.index + split[0].length;
    }
    result.push({ text: match[0].slice(start), start: match.index + start });
    return result;
  });
}

function firstPositive(text, regex) {
  for (const clause of clauses(text)) {
    for (const match of clause.text.matchAll(new RegExp(regex.source, 'gi'))) {
      if (!NEGATION.test(clause.text.slice(0, match.index))) {
        return { index: clause.start + match.index, length: match[0].length };
      }
    }
  }
  return null;
}

export function analyzeRules(text, _options = {}) {
  if (typeof text !== 'string' || !text.trim()) return { score: 0, flags: [] };
  const flags = [];
  const add = (type, match, why) => {
    if (match && !flags.some(flag => flag.type === type)) {
      flags.push({ type, span: [match.index, match.index + match.length], why });
    }
  };
  for (const clause of clauses(text)) {
    for (const noun of clause.text.matchAll(new RegExp(OTP_NOUN))) {
      const nearby = [...clause.text.matchAll(new RegExp(REQUEST_VERB))].filter(verb => Math.abs(verb.index - noun.index) <= 65);
      const request = nearby.some(verb => !REQUEST_NEGATION.test(clause.text.slice(0, verb.index)));
      const match = { index: clause.start + noun.index, length: noun[0].length };
      if (request) add('asks_otp', match, 'Asks you to send or enter an OTP, PIN, or password.');
      else if (nearby.length || /\b(?:keep|protect|never|huwag)\b/i.test(clause.text)) {
        add('warning_context', match, 'Mentions credentials in a safety warning; this adds no risk points.');
      }
    }
  }
  add('urgency', firstPositive(text, URGENCY), 'Pressures you to act quickly.');
  add('money_request', firstPositive(text, MONEY), 'Requests a transfer or an advance fee. Verify the reason independently.');
  add('prize_or_job_claim', firstPositive(text, PRIZE), 'Promises a prize or guaranteed returns.');
  if (JOB.test(text) && (JOB_BAIT.test(text) || flags.some(flag => flag.type === 'money_request'))) {
    add('prize_or_job_claim', firstPositive(text, JOB), 'Combines a job offer with unusually easy income or upfront fees.');
  }
  add('threat_account', firstPositive(text, THREAT), 'Uses account-access pressure or threats.');
  return { score: Math.min(100, flags.reduce((sum, flag) => sum + (WEIGHTS[flag.type] || 0), 0)), flags };
}
