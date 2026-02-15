'use strict';

function nowISO() {
  return new Date().toISOString();
}

function createId(prefix = 'id') {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rnd}`;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function round2(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function normalizePeriod(period) {
  if (typeof period !== 'string') {
    return null;
  }
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) {
    return null;
  }
  return `${m[1]}-${m[2]}`;
}

function getPeriodFromDate(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${date.getUTCFullYear()}-${m}`;
}

function periodRange(period) {
  const normalized = normalizePeriod(period);
  if (!normalized) {
    return null;
  }
  const [y, m] = normalized.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start, end };
}

function isDateInPeriod(dateLike, period) {
  const range = periodRange(period);
  if (!range) {
    return false;
  }
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return date >= range.start && date <= range.end;
}

function ratio(numerator, denominator) {
  const d = toNumber(denominator);
  if (d === 0) {
    return 0;
  }
  return toNumber(numerator) / d;
}

function uniq(array) {
  return [...new Set(array)];
}

function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      out[key] = obj[key];
    }
  }
  return out;
}

module.exports = {
  nowISO,
  createId,
  toNumber,
  round2,
  normalizePeriod,
  getPeriodFromDate,
  periodRange,
  isDateInPeriod,
  ratio,
  uniq,
  pick
};
