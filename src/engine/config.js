/** Scam Guard — Engine Configuration */

/** Scoring weights for each flag type */
export const WEIGHTS = {
  asks_otp: 40,
  urgency: 15,
  money_request: 25,
  prize_or_job_claim: 20,
  suspicious_link: 25,
  brand_link_mismatch: 30,
  threat_account: 10
};

/** Verdict bands */
export const BANDS = {
  SCAM: 70,
  SUSPICIOUS: 40
};

/** Embedding similarity thresholds (TODO: calibrate on test set) */
export const SIM_LOW = 0.45;
export const SIM_HIGH = 0.80;

/** Model to use for embeddings */
export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const MODEL_ALLOW_LOCAL = false;
export const MODEL_LOCAL_PATH = '/models/';
export const EMBED_TIMEOUT_MS = 15000;

/** All scam families */
export const FAMILIES = [
  'fake_job',
  'prize_scam',
  'parcel_fee',
  'account_phishing',
  'investment_romance',
  'lending_harassment',
  'impersonation_relative',
  'fake_ayuda',
  'unknown'
];

/** All channels */
export const CHANNELS = [
  'sms', 'messenger', 'telegram', 'email',
  'viber', 'whatsapp', 'call', 'other'
];

/** Family display names */
export const FAMILY_LABELS = {
  fake_job: 'Fake Job Offer',
  prize_scam: 'Prize / Giveaway Scam',
  parcel_fee: 'Parcel Fee Scam',
  account_phishing: 'Account Phishing',
  investment_romance: 'Investment / Romance Scam',
  lending_harassment: 'Lending Harassment',
  impersonation_relative: 'Relative Impersonation',
  fake_ayuda: 'Fake Govt Aid',
  unknown: 'Unknown'
};

/** Channel display names */
export const CHANNEL_LABELS = {
  sms: 'SMS',
  messenger: 'Messenger',
  telegram: 'Telegram',
  email: 'Email',
  viber: 'Viber',
  whatsapp: 'WhatsApp',
  call: 'Call',
  other: 'Other'
};

/** Channel icons */
export const CHANNEL_ICONS = {
  sms: '💬',
  messenger: '💭',
  telegram: '✈️',
  email: '📧',
  viber: '📞',
  whatsapp: '📱',
  call: '☎️',
  other: '💻'
};
