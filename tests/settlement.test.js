'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { handlers } = require('../cloudfunctions/_shared/handlers');
const { Roles } = require('../cloudfunctions/_shared/constants');
const { createTestServices } = require('./helpers');

async function seedFinance(services) {
  return services.store.insert('users', {
    userId: 'u_finance',
    openid: 'openid_finance',
    role: Roles.FINANCE,
    status: 'active'
  });
}

test('项目结算按利润率分档计算提成', async () => {
  const services = createTestServices();
  const finance = await seedFinance(services);

  await services.store.insert('commission_rules', {
    version: 'v_test',
    effectiveFrom: '2025-01',
    status: 'active',
    ranges: [
      { min: -999, max: 0.1, rate: 0 },
      { min: 0.1, max: 0.2, rate: 0.05 },
      { min: 0.2, max: 0.3, rate: 0.08 },
      { min: 0.3, max: 999, rate: 0.12 }
    ]
  });

  await services.store.insert('expense_claims', {
    claimId: 'c1',
    projectId: 'PX',
    claimType: 'electronic',
    applicantId: 'u1',
    amountTotal: 100,
    taxAmount: 10,
    occurDate: '2026-01-05T00:00:00.000Z',
    status: 'approved',
    source: 'miniapp_manual'
  });

  await services.store.insert('project_revenue', {
    recordId: 'rev1',
    projectId: 'PX',
    period: '2026-01',
    revenueAmount: 500,
    source: 'erp_pull'
  });

  await services.store.insert('project_labor_allocations', {
    allocationId: 'lab1',
    projectId: 'PX',
    period: '2026-01',
    laborAmount: 100,
    source: 'manual'
  });

  await services.store.insert('project_tax_fees', {
    feeId: 'tax1',
    projectId: 'PX',
    period: '2026-01',
    taxFeeAmount: 50,
    source: 'manual'
  });

  const res = await handlers.generateProjectSettlement({
    userId: finance.userId,
    projectId: 'PX',
    period: '2026-01'
  }, services);

  assert.equal(res.ok, true);
  assert.equal(res.settlement.profit, 250);
  assert.equal(res.settlement.profitRate, 0.5);
  assert.equal(res.settlement.commissionRate, 0.12);
  assert.equal(res.settlement.commissionAmount, 30);
});
