const TOKEN_LENGTH = 20;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MONTH_NAMES = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

export function normalizeToken(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isValidToken(value) {
  return normalizeToken(value).length === TOKEN_LENGTH;
}

function cleanText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\u00a0/g, ' ')
    .trim()
    .slice(0, 10000);
}

function toPositiveNumber(value) {
  if (value == null || value === '') return '';
  const digits = String(value).replace(/[,\s]/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(digits)) return '';
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : '';
}

function extractToken(text) {
  const candidates = [];
  const labeled = /(?:token(?:\s*(?:number|num\.?|no\.?|code))?)\s*[:#=-]?\s*\b(\d(?:[ -]?\d){19})\b/gi;
  for (const match of text.matchAll(labeled)) {
    const token = normalizeToken(match[1]);
    if (isValidToken(token)) candidates.push({ token, score: 2, index: match.index || 0 });
  }
  if (!candidates.length) {
    const anyToken = /\b(\d(?:[ -]?\d){19})\b/g;
    for (const match of text.matchAll(anyToken)) {
      const token = normalizeToken(match[1]);
      if (isValidToken(token)) candidates.push({ token, score: 1, index: match.index || 0 });
    }
  }
  if (!candidates.length) return '';
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates[0].token;
}

function extractAmount(text, token) {
  const patterns = [
    /(?:kshs?|kes|shs?|shillings?|k\.?sh)\s*\.?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:kshs?|kes|shs?|shillings?)\b/gi,
    /(?:amount|purchase|top[- ]?up|worth)\s*(?:of|is|:)?\s*(?:kshs?|kes|shs?)?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /\bpaid\s+(?:kshs?|kes|shs?)?\s*([\d,]+(?:\.\d{1,2})?)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = String(match[1] || '');
      if (raw.replace(/\D/g, '').length > 10) continue;
      if (normalizeToken(raw) === token && token) continue;
      const n = toPositiveNumber(raw);
      if (n !== '' && n <= 1000000) return n;
    }
  }
  return '';
}

function extractUnits(text) {
  const patterns = [
    /([\d,]+(?:\.\d{1,2})?)\s*(?:kwh|units?)\b/gi,
    /\bunits?\s*[:=]?\s*([\d,]+(?:\.\d{1,2})?)\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const n = toPositiveNumber(match[1]);
      if (n !== '' && n <= 100000) return n;
    }
  }
  return '';
}

function normalizeYear(value) {
  const year = Number(value);
  return year < 100 ? 2000 + year : year;
}

function monthNumber(value) {
  return MONTHS[String(value || '').toLowerCase().slice(0, 3)] || 0;
}

function collectDates(text) {
  const results = [];
  const patterns = [
    { re: /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g, map: m => ({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }) },
    { re: /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g, map: m => {
      let day = Number(m[1]);
      let month = Number(m[2]);
      const year = normalizeYear(m[3]);
      if (month > 12 && day <= 12) { const swap = day; day = month; month = swap; }
      return { year, month, day };
    } },
    { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+${MONTH_NAMES}[\\s,-]+(\\d{2,4})\\b`, 'gi'), map: m => ({ year: normalizeYear(m[3]), month: monthNumber(m[2]), day: Number(m[1]) }) },
    { re: new RegExp(`\\b${MONTH_NAMES}[\\s-]+(\\d{1,2})(?:st|nd|rd|th)?[\\s,-]+(\\d{2,4})\\b`, 'gi'), map: m => ({ year: normalizeYear(m[3]), month: monthNumber(m[1]), day: Number(m[2]) }) },
  ];
  for (const { re, map } of patterns) {
    for (const match of text.matchAll(re)) {
      const parts = map(match);
      if (!parts.year || !parts.month || !parts.day) continue;
      if (parts.year < 2000 || parts.year > 2100) continue;
      if (parts.month < 1 || parts.month > 12) continue;
      if (parts.day < 1 || parts.day > 31) continue;
      results.push({ ...parts, index: match.index || 0 });
    }
  }
  return results;
}

function extractDate(text) {
  const candidates = collectDates(text);
  if (!candidates.length) return null;
  const scored = candidates.map(candidate => {
    const before = text.slice(Math.max(0, candidate.index - 36), candidate.index).toLowerCase();
    let score = 0;
    if (/(?:paid|payment|purchase|bought|transaction|date|on\s*$)/.test(before)) score += 2;
    if (/(?:valid|expire|expiry|until|due)/.test(before)) score -= 3;
    return { ...candidate, score };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0];
}

function extractDateTime(text) {
  const timeMatch = text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  let hour = 0;
  let minute = 0;
  let second = 0;
  let hasTime = false;
  if (timeMatch) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
    second = Number(timeMatch[3] || 0);
    const suffix = String(timeMatch[4] || '').toLowerCase();
    if (suffix === 'pm' && hour < 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;
    hasTime = hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
  }
  const date = extractDate(text);
  if (!date) return { paidAt: '', hasTime: false };
  const parsed = new Date(date.year, date.month - 1, date.day, hasTime ? hour : 0, hasTime ? minute : 0, hasTime ? second : 0);
  if (parsed.getFullYear() !== date.year || parsed.getMonth() !== date.month - 1 || parsed.getDate() !== date.day) {
    return { paidAt: '', hasTime: false };
  }
  return { paidAt: parsed.toISOString(), hasTime };
}

function cleanLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').replace(/[.,;:]+$/, '').trim().slice(0, 60);
}

function isSenderLabel(candidate) {
  const reserved = new Set(['date', 'time', 'amount', 'token', 'units', 'ref', 'reference', 'transaction', 'account', 'meter', 'receipt', 'payment', 'paid', 'ksh', 'kes', 'balance', 'customer', 'dear']);
  const words = String(candidate || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (!words.length || words.length > 3) return false;
  return !words.some(word => reserved.has(word));
}

function extractSender(text) {
  const label = text.match(/^\s*([A-Za-z][A-Za-z0-9&.' -]{1,30})\s*:\s/);
  if (label) {
    const candidate = cleanLabel(label[1]);
    if (isSenderLabel(candidate)) return candidate;
  }
  const explicit = text.match(/\b(?:sender|from)\s*[:=]\s*([A-Za-z0-9&.' -]{2,40})/i);
  if (explicit) {
    const candidate = cleanLabel(explicit[1]);
    if (isSenderLabel(candidate)) return candidate;
  }
  const known = ['Kenya Power', 'KPLC', 'M-PESA', 'Mpesa', 'Safaricom', 'Airtel'];
  for (const name of known) {
    if (new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) return name;
  }
  return '';
}

function extractTransactionRef(text, token) {
  const patterns = [
    /\b(?:transaction|txn|trx|receipt|invoice)\s+(?:id|no\.?|number|code)\s*[:#=-]?\s*([A-Z0-9][A-Z0-9-]{4,39})\b/i,
    /\b(?:transaction|txn|trx|receipt|invoice)\s*[:#=-]\s*([A-Z0-9][A-Z0-9-]{4,39})\b/i,
    /\b(?:ref(?:erence)?)\s+(?:id|no\.?|number|code)\s*[:#=-]?\s*([A-Z0-9][A-Z0-9-]{4,39})\b/i,
    /\b(?:ref(?:erence)?)\s*[:#=-]\s*([A-Z0-9][A-Z0-9-]{4,39})\b/i,
    /\b([A-Z]{3}\d{6,10})\b\s+confirmed\b/i,
    /\b([A-Z0-9]{10})\b\s+confirmed\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const ref = cleanLabel(match[1]).replace(/[^A-Za-z0-9-]/g, '');
    if (ref && normalizeToken(ref) !== token) return ref.toUpperCase();
  }
  return '';
}

export function parseTokenMessage(input) {
  const text = cleanText(input);
  if (!text) return { tokenNumber: '', amount: '', units: '', paidAt: '', hasTime: false, sender: '', transactionRef: '' };
  const tokenNumber = extractToken(text);
  const amount = extractAmount(text, tokenNumber);
  const units = extractUnits(text);
  const { paidAt, hasTime } = extractDateTime(text);
  const sender = extractSender(text);
  const transactionRef = extractTransactionRef(text, tokenNumber);
  return { tokenNumber, amount, units, paidAt, hasTime, sender, transactionRef };
}
