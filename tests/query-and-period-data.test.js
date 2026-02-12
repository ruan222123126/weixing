'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { handlers } = require('../cloudfunctions/_shared/handlers');
const { Roles } = require('../cloudfunctions/_shared/constants');
const { createTestServices } = require('./helpers');

test('listClaims/getClaimDetail 按角色返回正确数据', async () => {
  const services = createTestServices();

  await services.store.insert('users', { userId: 'u1', role: Roles.APPLICANT, status: 'active' });
  await services.store.insert('users', { userId: 'u2', role: Roles.APPLICANT, status: 'active' });
  await services.store.insert('users', { userId: 'f1', role: Roles.FINANCE, status: 'active' });

  await services.store.insert('expense_claims', {
    claimId: 'c1',
    projectId: 'P1',
    applicantId: 'u1',
    amountTotal: 100,
    taxAmount: 0,
    status: 'submitted',
    occurDate: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z'
  });
  await services.store.insert('expense_items', {
    itemId: 'i1',
    claimId: 'c1',
    projectId: 'P1',
    category: '交通',
    amount: 100,
    taxAmount: 0
  });

  const mine = await handlers.listClaims({ userId: 'u1', scope: 'mine' }, services);
  assert.equal(mine.claims.length, 1);

  const pending = await handlers.listClaims({ userId: 'f1', scope: 'pending' }, services);
  assert.equal(pending.claims.length, 1);

  const detail = await handlers.getClaimDetail({ userId: 'f1', claimId: 'c1' }, services);
  assert.equal(detail.claim.claimId, 'c1');
  assert.equal(detail.items.length, 1);
});

test('upsertProjectPeriodData 可维护人工与税费', async () => {
  const services = createTestServices();
  await services.store.insert('users', { userId: 'f1', role: Roles.FINANCE, status: 'active' });

  const res = await handlers.upsertProjectPeriodData({
    userId: 'f1',
    projectId: 'P2',
    period: '2026-01',
    laborAmount: 123.45,
    taxFeeAmount: 67.89
  }, services);

  assert.equal(res.ok, true);
  assert.equal(res.labor.laborAmount, 123.45);
  assert.equal(res.taxFee.taxFeeAmount, 67.89);
});
