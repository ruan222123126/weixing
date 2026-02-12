'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { handlers } = require('../cloudfunctions/_shared/handlers');
const { Roles, ClaimStatus } = require('../cloudfunctions/_shared/constants');
const { createTestServices } = require('./helpers');

async function seedUsers(services) {
  const applicant = await services.store.insert('users', {
    userId: 'u_applicant',
    openid: 'openid_applicant',
    role: Roles.APPLICANT,
    status: 'active'
  });
  const finance = await services.store.insert('users', {
    userId: 'u_finance',
    openid: 'openid_finance',
    role: Roles.FINANCE,
    status: 'active'
  });
  return { applicant, finance };
}

test('报销创建-提交-审批闭环', async () => {
  const services = createTestServices();
  const { applicant, finance } = await seedUsers(services);

  const createRes = await handlers.createOrUpdateClaim({
    userId: applicant.userId,
    projectId: 'P1001',
    claimType: 'electronic',
    occurDate: '2026-01-12',
    items: [
      { category: '交通', amount: 120.5, taxAmount: 6.02 },
      { category: '餐饮', amount: 80, taxAmount: 0 }
    ]
  }, services);

  assert.equal(createRes.ok, true);
  assert.equal(createRes.claim.status, ClaimStatus.DRAFT);
  assert.equal(createRes.claim.amountTotal, 200.5);

  const submitRes = await handlers.submitClaim({
    userId: applicant.userId,
    claimId: createRes.claim.claimId
  }, services);

  assert.equal(submitRes.claim.status, ClaimStatus.SUBMITTED);

  const approveRes = await handlers.approveClaim({
    userId: finance.userId,
    claimId: createRes.claim.claimId,
    action: 'approve'
  }, services);

  assert.equal(approveRes.claim.status, ClaimStatus.APPROVED);
});
