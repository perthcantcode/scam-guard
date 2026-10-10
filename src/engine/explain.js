/** Scam Guard — Template-based Explanation Engine (no LLM) */

import { FAMILY_LABELS } from './config.js';

const FAMILY_ADVICE = {
  fake_job: {
    en: 'Real employers never ask for fees before hiring. If it sounds too good to be true, it probably is.',
    tl: 'Hindi humihingi ng bayad ang mga tunay na employer bago ka tanggapin. Kung sobrang ganda ng offer, malamang scam yan.'
  },
  prize_scam: {
    en: "You can't win a contest you didn't join. No legitimate company asks for fees to claim a prize.",
    tl: 'Hindi ka mananalo sa contest na hindi mo sinalihan. Walang tunay na kumpanya na humihingi ng bayad para kunin ang premyo.'
  },
  parcel_fee: {
    en: 'Check the courier\'s official app or website directly. Legitimate delivery fees are handled through the platform.',
    tl: 'I-check ang official app o website ng courier. Ang mga tunay na delivery fee ay doon mismo pinapabayad.'
  },
  account_phishing: {
    en: 'Banks and e-wallets will never ask for your PIN or OTP via text. Go to the official app to check your account.',
    tl: 'Hindi hihilingin ng mga bangko o e-wallet ang iyong PIN o OTP sa text. Pumunta sa official app para i-check ang account mo.'
  },
  investment_romance: {
    en: 'Guaranteed returns don\'t exist. Be extremely cautious with investment offers from strangers.',
    tl: 'Walang investment na siguradong kikita. Mag-ingat sa mga investment offer mula sa hindi mo kilala.'
  },
  lending_harassment: {
    en: 'Legitimate lenders don\'t threaten or harass. Report harassment to the SEC or your local authorities.',
    tl: 'Hindi nananakot ang mga tunay na lending company. I-report ang harassment sa SEC o sa mga awtoridad.'
  },
  impersonation_relative: {
    en: 'Always verify by calling the person directly on their known number before sending money.',
    tl: 'Palaging i-verify sa pamamagitan ng pagtawag sa kilalang number ng tao bago magpadala ng pera.'
  },
  fake_ayuda: {
    en: 'Verify aid announcements through the agency’s official website or office before sharing details or paying a fee.',
    tl: 'I-verify ang anunsyo ng ayuda sa opisyal na website o opisina bago magbigay ng detalye o magbayad.'
  },
  unknown: {
    en: 'Be cautious with unexpected messages. Don\'t click links or share personal information.',
    tl: 'Mag-ingat sa mga hindi inaasahang mensahe. Huwag mag-click ng link o magbigay ng personal na impormasyon.'
  }
};

const VERDICT_LINES = {
  scam: {
    en: '⚠️ This message has strong scam indicators.',
    tl: '⚠️ May malakas na palatandaan ng scam ang mensaheng ito.'
  },
  suspicious: {
    en: '⚡ This message has some suspicious elements. Be careful.',
    tl: '⚡ May ilang kahina-hinalang elemento ang mensaheng ito. Mag-ingat.'
  },
  likely_ok: {
    en: 'Few or no warning signs found. This does not verify the sender or guarantee the message is safe. Never share your OTP.',
    tl: 'Kaunti o walang nakitang babala. Hindi nito tiniyak ang nagpadala o kaligtasan ng mensahe. Huwag ibigay ang OTP.'
  }
};

const WHAT_TO_DO = {
  en: "Don't click any links. Don't reply. Block and report the sender. Tell your family and friends.",
  tl: 'Huwag mag-click ng kahit anong link. Huwag mag-reply. I-block at i-report ang nagpadala. Sabihin sa pamilya at mga kaibigan mo.'
};

/**
 * Build template-based explanation from analysis result
 * @param {Object} result - The analysis result
 * @returns {{ en: string, tl: string }}
 */
export function buildExplanation(result) {
  const { verdict, flags = [], family = 'unknown' } = result;

  // Verdict line
  const verdictLine = VERDICT_LINES[verdict] || VERDICT_LINES.likely_ok;

  if (verdict === 'likely_ok') {
    return {
      en: verdictLine.en,
      tl: verdictLine.tl
    };
  }

  // Build bullet points from top flags (up to 3)
  const topFlags = flags
    .filter(f => f.type !== 'warning_context')
    .slice(0, 3);

  const bulletPoints = topFlags.map(f => {
    return `• ${f.why}`;
  }).join('\n');

  // Family advice
  const advice = FAMILY_ADVICE[family] || FAMILY_ADVICE.unknown;

  const en = [
    verdictLine.en,
    bulletPoints,
    advice.en,
    WHAT_TO_DO.en
  ].filter(Boolean).join('\n\n');

  const tl = [
    verdictLine.tl,
    bulletPoints,
    advice.tl,
    WHAT_TO_DO.tl
  ].filter(Boolean).join('\n\n');

  return { en, tl };
}
