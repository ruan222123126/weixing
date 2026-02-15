'use strict';

const { DEFAULT_COMMISSION_RANGES } = require('./constants');
const { round2, ratio, toNumber } = require('./utils');

function resolveActiveCommissionRule(rules = [], period) {
  if (!rules.length) {
    return {
      version: 'default-v1',
      effectiveFrom: '1970-01',
      ranges: DEFAULT_COMMISSION_RANGES
    };
  }

  const candidates = rules
    .filter((rule) => rule.status !== 'disabled')
    .filter((rule) => !rule.effectiveFrom || rule.effectiveFrom <= period)
    .sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')));

  if (!candidates.length) {
    return {
      version: 'default-v1',
      effectiveFrom: '1970-01',
      ranges: DEFAULT_COMMISSION_RANGES
    };
  }
  return candidates[0];
}

function resolveCommissionRate(ranges = DEFAULT_COMMISSION_RANGES, profitRate) {
  for (const range of ranges) {
    const min = Number.isFinite(range.min) ? range.min : Number.NEGATIVE_INFINITY;
    const max = Number.isFinite(range.max) ? range.max : Number.POSITIVE_INFINITY;
    if (profitRate >= min && profitRate < max) {
      return toNumber(range.rate, 0);
    }
  }
  return 0;
}

function computeSettlement({
  revenue,
  expenseCost,
  taxFee,
  laborCost,
  commissionRanges
}) {
  const safeRevenue = round2(revenue);
  const safeExpense = round2(expenseCost);
  const safeTaxFee = round2(taxFee);
  const safeLabor = round2(laborCost);

  const profit = round2(safeRevenue - safeExpense - safeTaxFee - safeLabor);
  const profitRate = ratio(profit, safeRevenue);
  const commissionRate = resolveCommissionRate(commissionRanges, profitRate);
  const commissionAmount = round2(Math.max(profit, 0) * commissionRate);

  return {
    revenue: safeRevenue,
    expenseCost: safeExpense,
    taxFee: safeTaxFee,
    laborCost: safeLabor,
    profit,
    profitRate,
    commissionRate,
    commissionAmount
  };
}

module.exports = {
  resolveActiveCommissionRule,
  resolveCommissionRate,
  computeSettlement
};
