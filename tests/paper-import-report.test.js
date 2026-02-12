'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const XLSX = require('xlsx');

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

test('纸质导入支持部分成功并返回错误', async () => {
  const services = createTestServices();
  const finance = await seedFinance(services);

  const res = await handlers.importPaperClaims({
    userId: finance.userId,
    period: '2026-01',
    rows: [
      {
        projectId: 'P1001',
        applicantId: 'u_staff_1',
        occurDate: '2026-01-10',
        category: '办公',
        amount: 300,
        taxAmount: 30,
        remark: '纸质单1'
      },
      {
        projectId: 'P1002',
        applicantId: 'u_staff_2',
        occurDate: '2026-02-01',
        category: '物料',
        amount: 50,
        taxAmount: 0,
        remark: '超出期间'
      }
    ]
  }, services);

  assert.equal(res.ok, true);
  assert.equal(res.job.successCount, 1);
  assert.equal(res.job.failCount, 1);
  assert.equal(res.job.status, 'partial_success');
});

test('月报导出包含汇总明细与异常清单', async () => {
  const services = createTestServices();
  const finance = await seedFinance(services);

  await handlers.importPaperClaims({
    userId: finance.userId,
    period: '2026-01',
    rows: [
      {
        projectId: 'P2001',
        applicantId: 'u_staff_1',
        occurDate: '2026-01-03',
        category: '交通',
        amount: 100,
        taxAmount: 10,
        remark: ''
      }
    ]
  }, services);

  await services.store.insert('project_revenue', {
    recordId: 'rev_1',
    projectId: 'P2001',
    period: '2026-01',
    revenueAmount: 1000,
    source: 'erp_pull'
  });

  const report = await handlers.generateMonthlyReport({
    userId: finance.userId,
    period: '2026-01'
  }, services);

  assert.equal(report.ok, true);
  assert.equal(report.stats.summaryCount, 1);
  assert.equal(report.stats.detailCount, 1);
  assert.equal(report.stats.anomalyCount, 1);

  const wb = XLSX.read(Buffer.from(report.fileBase64, 'base64'), { type: 'buffer' });
  assert.deepEqual(wb.SheetNames, ['项目汇总', '费用明细', '异常清单']);
});
