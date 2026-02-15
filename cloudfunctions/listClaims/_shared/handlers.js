'use strict';

const {
  Roles,
  ClaimStatus,
  ClaimType,
  ClaimSource,
  ImportJobType,
  ImportJobStatus
} = require('./constants');
const { AppError, assert } = require('./errors');
const { assertFinanceOrAdmin, hasAnyRole } = require('./authz');
const {
  toNumber,
  round2,
  normalizePeriod,
  getPeriodFromDate,
  isDateInPeriod,
  uniq,
  pick
} = require('./utils');
const {
  parsePaperClaimsRowsFromBase64,
  validatePaperImportRow,
  buildMonthlyWorkbook
} = require('./excel');
const {
  resolveActiveCommissionRule,
  computeSettlement
} = require('./settlement');

async function writeOperationLog(services, { action, userId, targetType, targetId, payload = {} }) {
  await services.store.insert('operation_logs', {
    logId: services.createId('log'),
    action,
    userId: userId || null,
    targetType,
    targetId,
    payload,
    createdAt: services.now()
  });
}

async function getCurrentUser(event, services, options = {}) {
  const { allowMissing = false } = options;
  if (event.currentUser) {
    return event.currentUser;
  }

  if (event.userId) {
    const byUserId = await services.store.findOne('users', { userId: event.userId });
    if (byUserId) {
      return byUserId;
    }
  }

  const openid = event.openid || (services.resolveOpenId && services.resolveOpenId());
  if (openid) {
    const byOpenId = await services.store.findOne('users', { openid });
    if (byOpenId) {
      return byOpenId;
    }
  }

  if (allowMissing) {
    return null;
  }
  throw new AppError('用户未登录或不存在', 'UNAUTHORIZED', 401);
}

function resolveAutoRole(phone, config, currentRole) {
  const adminPhones = (config && config.adminPhones) || [];
  const financePhones = (config && config.financePhones) || [];

  if (phone && adminPhones.includes(phone)) {
    return Roles.ADMIN;
  }
  if (phone && financePhones.includes(phone)) {
    return Roles.FINANCE;
  }
  return currentRole;
}

async function ensureProjectExists(services, projectId, operatorId = null) {
  const normalized = String(projectId || '').trim();
  if (!normalized) {
    return null;
  }

  let project = await services.store.findOne('projects', { projectId: normalized });
  if (project) {
    return project;
  }

  project = await services.store.insert('projects', {
    projectId: normalized,
    name: normalized,
    status: 'active',
    source: 'auto',
    owner: '',
    createdBy: operatorId || 'system',
    createdAt: services.now(),
    updatedAt: services.now()
  });

  return project;
}

function sanitizeClaimItems(items) {
  assert(Array.isArray(items) && items.length > 0, '报销明细不能为空');
  return items.map((item, index) => {
    const amount = round2(toNumber(item.amount, NaN));
    const taxAmount = round2(toNumber(item.taxAmount, 0));
    const category = String(item.category || '').trim();

    assert(category, `第 ${index + 1} 条明细 category 不能为空`);
    assert(Number.isFinite(amount) && amount > 0, `第 ${index + 1} 条明细 amount 必须大于 0`);
    assert(Number.isFinite(taxAmount) && taxAmount >= 0, `第 ${index + 1} 条明细 taxAmount 不能小于 0`);

    return {
      category,
      amount,
      taxAmount,
      remark: String(item.remark || '').trim()
    };
  });
}

function resolveClaimSource(claimType, source) {
  if (source) {
    return source;
  }
  if (claimType === ClaimType.PAPER) {
    return ClaimSource.PAPER_MANUAL;
  }
  return ClaimSource.MINIAPP_MANUAL;
}

function ensureClaimType(claimType) {
  assert([ClaimType.ELECTRONIC, ClaimType.PAPER].includes(claimType), 'claimType 非法');
}

function ensureDate(dateLike, fieldName) {
  assert(typeof dateLike === 'string' && dateLike.trim(), `${fieldName} 不能为空`);
  const date = new Date(dateLike);
  assert(!Number.isNaN(date.getTime()), `${fieldName} 日期格式错误`);
  return date.toISOString();
}

async function upsertClaimWithItems(event, services, currentUser) {
  const claimId = event.claimId;
  const projectId = String(event.projectId || '').trim();
  const claimType = String(event.claimType || '').trim();
  const occurDate = ensureDate(event.occurDate, 'occurDate');
  const items = sanitizeClaimItems(event.items || []);

  ensureClaimType(claimType);
  assert(projectId, 'projectId 不能为空');
  await ensureProjectExists(services, projectId, currentUser.userId);

  const amountTotal = round2(items.reduce((sum, item) => sum + item.amount, 0));
  const taxAmount = round2(items.reduce((sum, item) => sum + item.taxAmount, 0));

  const now = services.now();
  const applicantId = String(event.applicantId || currentUser.userId || '').trim();
  assert(applicantId, 'applicantId 不能为空');

  const baseClaim = {
    projectId,
    claimType,
    occurDate,
    applicantId,
    amountTotal,
    taxAmount,
    costCategory: String(event.costCategory || '').trim(),
    source: resolveClaimSource(claimType, event.source),
    attachments: Array.isArray(event.attachments) ? event.attachments : [],
    updatedAt: now
  };

  let claim;
  if (claimId) {
    const existing = await services.store.findOne('expense_claims', { claimId });
    assert(existing, '报销单不存在', 'NOT_FOUND', 404);

    const canEdit = existing.applicantId === currentUser.userId || hasAnyRole(currentUser, [Roles.FINANCE, Roles.ADMIN]);
    assert(canEdit, '无权限编辑该报销单', 'FORBIDDEN', 403);
    assert(
      [ClaimStatus.DRAFT, ClaimStatus.REJECTED].includes(existing.status),
      '仅草稿或已驳回状态可编辑'
    );

    claim = await services.store.updateById('expense_claims', 'claimId', claimId, {
      ...baseClaim
    });
    await services.store.deleteMany('expense_items', { claimId });
  } else {
    claim = await services.store.insert('expense_claims', {
      claimId: services.createId('claim'),
      status: ClaimStatus.DRAFT,
      createdAt: now,
      ...baseClaim
    });
  }

  const savedItems = [];
  for (const item of items) {
    const saved = await services.store.insert('expense_items', {
      itemId: services.createId('item'),
      claimId: claim.claimId,
      projectId: claim.projectId,
      ...item,
      createdAt: now,
      updatedAt: now
    });
    savedItems.push(saved);
  }

  await writeOperationLog(services, {
    action: claimId ? 'claim.update' : 'claim.create',
    userId: currentUser.userId,
    targetType: 'expense_claim',
    targetId: claim.claimId,
    payload: {
      amountTotal,
      itemCount: items.length
    }
  });

  return {
    claim,
    items: savedItems
  };
}

async function authLogin(event, services) {
  const openid = event.openid || (services.resolveOpenId && services.resolveOpenId());
  if (!openid) {
    const sourceInfo = services.inspectOpenIdSources ? services.inspectOpenIdSources() : null;
    console.error('[authLogin] missing openid', sourceInfo || {
      hasEventOpenid: Boolean(event && event.openid)
    });
    throw new AppError(
      '缺少 openid，无法登录。请关闭云函数本地调试，并确认已在微信开发者工具选择正确云环境后再试。',
      'UNAUTHORIZED',
      401,
      sourceInfo
    );
  }

  const now = services.now();
  let user = await services.store.findOne('users', { openid });

  const phone = String(event.phone || '').trim();
  const name = String(event.name || '').trim();

  if (!user) {
    user = await services.store.insert('users', {
      userId: services.createId('user'),
      openid,
      phone,
      name,
      role: Roles.APPLICANT,
      status: 'active',
      createdAt: now,
      updatedAt: now
    });
  } else {
    user = await services.store.updateById('users', 'userId', user.userId, {
      ...(phone ? { phone } : {}),
      ...(name ? { name } : {}),
      updatedAt: now
    });
  }

  const targetRole = resolveAutoRole(phone, services.config || {}, user.role);
  if (targetRole !== user.role) {
    user = await services.store.updateById('users', 'userId', user.userId, {
      role: targetRole,
      updatedAt: now
    });
  }

  return {
    ok: true,
    user: pick(user, ['userId', 'openid', 'phone', 'name', 'role', 'status'])
  };
}

async function createOrUpdateClaim(event, services) {
  const currentUser = await getCurrentUser(event, services);
  const result = await upsertClaimWithItems(event, services, currentUser);
  return {
    ok: true,
    ...result
  };
}

async function submitClaim(event, services) {
  const currentUser = await getCurrentUser(event, services);
  const claimId = String(event.claimId || '').trim();
  assert(claimId, 'claimId 不能为空');

  const claim = await services.store.findOne('expense_claims', { claimId });
  assert(claim, '报销单不存在', 'NOT_FOUND', 404);

  const isOwner = claim.applicantId === currentUser.userId;
  const privileged = hasAnyRole(currentUser, [Roles.FINANCE, Roles.ADMIN]);
  assert(isOwner || privileged, '无权限提交该报销单', 'FORBIDDEN', 403);
  assert([ClaimStatus.DRAFT, ClaimStatus.REJECTED].includes(claim.status), '当前状态不可提交');

  const items = await services.store.findMany('expense_items', { claimId });
  assert(items.length > 0, '报销明细不能为空');

  const updated = await services.store.updateById('expense_claims', 'claimId', claimId, {
    status: ClaimStatus.SUBMITTED,
    submittedAt: services.now(),
    updatedAt: services.now()
  });

  await writeOperationLog(services, {
    action: 'claim.submit',
    userId: currentUser.userId,
    targetType: 'expense_claim',
    targetId: claimId
  });

  return {
    ok: true,
    claim: updated
  };
}

async function approveClaim(event, services) {
  const currentUser = await getCurrentUser(event, services);
  assertFinanceOrAdmin(currentUser);

  const claimId = String(event.claimId || '').trim();
  assert(claimId, 'claimId 不能为空');

  const action = String(event.action || 'approve').trim();
  assert(['approve', 'reject', 'void'].includes(action), 'action 非法');

  const claim = await services.store.findOne('expense_claims', { claimId });
  assert(claim, '报销单不存在', 'NOT_FOUND', 404);

  let patch = { updatedAt: services.now() };

  if (action === 'approve') {
    assert(claim.status === ClaimStatus.SUBMITTED, '仅待审批状态可通过');
    patch = {
      ...patch,
      status: ClaimStatus.APPROVED,
      approvalBy: currentUser.userId,
      approvalAt: services.now(),
      rejectReason: ''
    };
  }

  if (action === 'reject') {
    assert(claim.status === ClaimStatus.SUBMITTED, '仅待审批状态可驳回');
    patch = {
      ...patch,
      status: ClaimStatus.REJECTED,
      approvalBy: currentUser.userId,
      approvalAt: services.now(),
      rejectReason: String(event.reason || '').trim() || '未通过审核'
    };
  }

  if (action === 'void') {
    assert([ClaimStatus.SUBMITTED, ClaimStatus.APPROVED, ClaimStatus.REJECTED].includes(claim.status), '当前状态不可作废');
    patch = {
      ...patch,
      status: ClaimStatus.VOID,
      voidReason: String(event.reason || '').trim() || '人工作废'
    };
  }

  const updated = await services.store.updateById('expense_claims', 'claimId', claimId, patch);

  await writeOperationLog(services, {
    action: `claim.${action}`,
    userId: currentUser.userId,
    targetType: 'expense_claim',
    targetId: claimId,
    payload: { reason: event.reason || '' }
  });

  return {
    ok: true,
    claim: updated
  };
}

async function importPaperClaims(event, services) {
  const currentUser = await getCurrentUser(event, services);
  assertFinanceOrAdmin(currentUser);

  const period = normalizePeriod(event.period);
  assert(period, 'period 格式错误，期望 YYYY-MM');

  let rows = Array.isArray(event.rows) ? event.rows : null;
  const mode = String(event.mode || 'excel').trim();

  if (!rows) {
    assert(typeof event.fileBase64 === 'string' && event.fileBase64.length > 0, '缺少 rows 或 fileBase64');
    rows = parsePaperClaimsRowsFromBase64(event.fileBase64);
  }

  const now = services.now();
  const job = await services.store.insert('import_jobs', {
    jobId: services.createId('job'),
    type: ImportJobType.PAPER_EXCEL,
    status: ImportJobStatus.PROCESSING,
    successCount: 0,
    failCount: 0,
    errors: [],
    createdAt: now,
    updatedAt: now
  });

  const errors = [];
  let successCount = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = {
      projectId: String(rows[i].projectId || '').trim(),
      applicantId: String(rows[i].applicantId || currentUser.userId || '').trim(),
      occurDate: String(rows[i].occurDate || '').trim(),
      category: String(rows[i].category || '').trim(),
      amount: toNumber(rows[i].amount, NaN),
      taxAmount: toNumber(rows[i].taxAmount, 0),
      remark: String(rows[i].remark || '').trim()
    };

    const validated = validatePaperImportRow(row, i);
    if (!validated.ok) {
      errors.push(...validated.errors);
      continue;
    }

    const rowPeriod = getPeriodFromDate(row.occurDate);
    if (rowPeriod !== period) {
      errors.push(`第 ${i + 1} 行: occurDate 不属于期间 ${period}`);
      continue;
    }

    await ensureProjectExists(services, row.projectId, currentUser.userId);

    const claimId = services.createId('claim');
    const claim = await services.store.insert('expense_claims', {
      claimId,
      projectId: row.projectId,
      claimType: ClaimType.PAPER,
      applicantId: row.applicantId,
      amountTotal: round2(row.amount),
      taxAmount: round2(row.taxAmount),
      costCategory: row.category,
      occurDate: ensureDate(row.occurDate, `第 ${i + 1} 行 occurDate`),
      status: ClaimStatus.APPROVED,
      approvalBy: currentUser.userId,
      approvalAt: now,
      source: mode === 'manual' ? ClaimSource.PAPER_MANUAL : ClaimSource.PAPER_EXCEL,
      attachments: [],
      createdAt: now,
      updatedAt: now
    });

    await services.store.insert('expense_items', {
      itemId: services.createId('item'),
      claimId: claim.claimId,
      projectId: row.projectId,
      category: row.category,
      amount: round2(row.amount),
      taxAmount: round2(row.taxAmount),
      remark: row.remark,
      createdAt: now,
      updatedAt: now
    });

    successCount += 1;
  }

  const failCount = errors.length;
  const status = failCount === 0
    ? ImportJobStatus.SUCCESS
    : (successCount > 0 ? ImportJobStatus.PARTIAL_SUCCESS : ImportJobStatus.FAILED);

  const updatedJob = await services.store.updateById('import_jobs', 'jobId', job.jobId, {
    status,
    successCount,
    failCount,
    errors,
    updatedAt: services.now()
  });

  await writeOperationLog(services, {
    action: 'paper.import',
    userId: currentUser.userId,
    targetType: 'import_job',
    targetId: job.jobId,
    payload: { period, successCount, failCount }
  });

  return {
    ok: true,
    job: updatedJob
  };
}

async function pullErpRevenue(event, services) {
  const manualTrigger = !event.system;
  if (manualTrigger) {
    const currentUser = await getCurrentUser(event, services);
    assertFinanceOrAdmin(currentUser);
  }

  const period = normalizePeriod(event.period);
  assert(period, 'period 格式错误，期望 YYYY-MM');

  const now = services.now();
  const job = await services.store.insert('import_jobs', {
    jobId: services.createId('job'),
    type: ImportJobType.ERP_PULL,
    status: ImportJobStatus.PROCESSING,
    successCount: 0,
    failCount: 0,
    errors: [],
    createdAt: now,
    updatedAt: now
  });

  let rows = Array.isArray(event.rows) ? event.rows : null;
  if (!rows) {
    const endpoint = event.endpoint || (services.config && services.config.erpEndpoint);
    const token = event.token || (services.config && services.config.erpToken);
    assert(endpoint, '缺少 ERP 接口地址 endpoint');
    assert(typeof services.fetch === 'function', '当前运行环境不支持 fetch');

    const url = new URL(endpoint);
    url.searchParams.set('period', period);
    const resp = await services.fetch(url.toString(), {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    assert(resp.ok, `ERP 拉取失败: ${resp.status}`);
    const payload = await resp.json();
    rows = Array.isArray(payload) ? payload : payload.items;
  }

  assert(Array.isArray(rows), 'ERP 数据格式错误，应为数组');

  const errors = [];
  let successCount = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || {};
    const projectId = String(row.projectId || '').trim();
    const revenueAmount = round2(toNumber(row.revenueAmount, NaN));

    if (!projectId) {
      errors.push(`第 ${i + 1} 行: projectId 不能为空`);
      continue;
    }
    if (!Number.isFinite(revenueAmount) || revenueAmount < 0) {
      errors.push(`第 ${i + 1} 行: revenueAmount 非法`);
      continue;
    }

    await ensureProjectExists(services, projectId);

    await services.store.upsertOne(
      'project_revenue',
      { projectId, period },
      {
        revenueAmount,
        source: 'erp_pull',
        syncBatchId: job.jobId,
        updatedAt: services.now()
      },
      {
        recordId: services.createId('rev'),
        createdAt: services.now()
      }
    );

    successCount += 1;
  }

  const failCount = errors.length;
  const status = failCount === 0
    ? ImportJobStatus.SUCCESS
    : (successCount > 0 ? ImportJobStatus.PARTIAL_SUCCESS : ImportJobStatus.FAILED);

  const updatedJob = await services.store.updateById('import_jobs', 'jobId', job.jobId, {
    status,
    successCount,
    failCount,
    errors,
    updatedAt: services.now()
  });

  return {
    ok: true,
    job: updatedJob
  };
}

async function generateMonthlyReport(event, services) {
  const currentUser = await getCurrentUser(event, services);
  assertFinanceOrAdmin(currentUser);

  const period = normalizePeriod(event.period);
  assert(period, 'period 格式错误，期望 YYYY-MM');

  const filterProjectId = String(event.projectId || '').trim() || null;

  const claims = (await services.store.list('expense_claims')).filter((claim) => {
    if (claim.status !== ClaimStatus.APPROVED) {
      return false;
    }
    if (!isDateInPeriod(claim.occurDate, period)) {
      return false;
    }
    if (filterProjectId && claim.projectId !== filterProjectId) {
      return false;
    }
    return true;
  });

  const claimIds = new Set(claims.map((claim) => claim.claimId));
  const items = (await services.store.list('expense_items')).filter((item) => claimIds.has(item.claimId));

  const summaryMap = new Map();
  for (const claim of claims) {
    const key = claim.projectId;
    const curr = summaryMap.get(key) || {
      period,
      projectId: key,
      claimCount: 0,
      expenseTotal: 0,
      taxTotal: 0
    };
    curr.claimCount += 1;
    curr.expenseTotal = round2(curr.expenseTotal + toNumber(claim.amountTotal));
    curr.taxTotal = round2(curr.taxTotal + toNumber(claim.taxAmount));
    summaryMap.set(key, curr);
  }
  const summaryRows = [...summaryMap.values()];

  const claimById = new Map(claims.map((claim) => [claim.claimId, claim]));
  const detailRows = items.map((item) => {
    const claim = claimById.get(item.claimId) || {};
    return {
      period,
      projectId: item.projectId,
      claimId: item.claimId,
      occurDate: claim.occurDate || '',
      applicantId: claim.applicantId || '',
      category: item.category,
      amount: round2(item.amount),
      taxAmount: round2(item.taxAmount),
      source: claim.source || ''
    };
  });

  const revenueRows = (await services.store.findMany('project_revenue', { period }));
  const laborRows = (await services.store.findMany('project_labor_allocations', { period }));
  const taxFeeRows = (await services.store.findMany('project_tax_fees', { period }));

  const involvedProjectIds = uniq([
    ...summaryRows.map((row) => row.projectId),
    ...revenueRows.map((row) => row.projectId),
    ...laborRows.map((row) => row.projectId),
    ...taxFeeRows.map((row) => row.projectId)
  ]).filter((id) => !filterProjectId || id === filterProjectId);

  const anomalyRows = [];
  for (const projectId of involvedProjectIds) {
    const issues = [];
    if (!revenueRows.find((row) => row.projectId === projectId)) {
      issues.push('缺少收入数据');
    }
    if (!laborRows.find((row) => row.projectId === projectId)) {
      issues.push('缺少人工摊销');
    }
    if (!taxFeeRows.find((row) => row.projectId === projectId)) {
      issues.push('缺少税费数据');
    }
    if (issues.length > 0) {
      anomalyRows.push({
        period,
        projectId,
        issues: issues.join('；')
      });
    }
  }

  const workbook = buildMonthlyWorkbook({ summaryRows, detailRows, anomalyRows });
  const includeFile = event.includeFile !== false;

  await writeOperationLog(services, {
    action: 'report.monthly.generate',
    userId: currentUser.userId,
    targetType: 'monthly_report',
    targetId: `${period}:${filterProjectId || 'ALL'}`,
    payload: {
      summaryCount: summaryRows.length,
      detailCount: detailRows.length,
      anomalyCount: anomalyRows.length
    }
  });

  return {
    ok: true,
    period,
    stats: {
      summaryCount: summaryRows.length,
      detailCount: detailRows.length,
      anomalyCount: anomalyRows.length
    },
    fileName: workbook.fileName,
    mimeType: workbook.mimeType,
    ...(includeFile ? { fileBase64: workbook.base64 } : {})
  };
}

async function generateProjectSettlement(event, services) {
  const currentUser = await getCurrentUser(event, services);
  assertFinanceOrAdmin(currentUser);

  const projectId = String(event.projectId || '').trim();
  const period = normalizePeriod(event.period);

  assert(projectId, 'projectId 不能为空');
  assert(period, 'period 格式错误，期望 YYYY-MM');

  const approvedClaims = (await services.store.list('expense_claims')).filter((claim) => (
    claim.projectId === projectId
    && claim.status === ClaimStatus.APPROVED
    && isDateInPeriod(claim.occurDate, period)
  ));

  const expenseCost = round2(approvedClaims.reduce((sum, claim) => sum + toNumber(claim.amountTotal), 0));

  const revenue = await services.store.findOne('project_revenue', { projectId, period });
  const labor = await services.store.findOne('project_labor_allocations', { projectId, period });
  const taxFee = await services.store.findOne('project_tax_fees', { projectId, period });

  assert(revenue, '无法结算: 缺少项目收入数据', 'MISSING_REVENUE');
  assert(labor, '无法结算: 缺少人工摊销数据', 'MISSING_LABOR');
  assert(taxFee, '无法结算: 缺少税费数据', 'MISSING_TAX');

  const rule = resolveActiveCommissionRule(await services.store.list('commission_rules'), period);
  const settlement = computeSettlement({
    revenue: revenue.revenueAmount,
    expenseCost,
    taxFee: taxFee.taxFeeAmount,
    laborCost: labor.laborAmount,
    commissionRanges: rule.ranges
  });

  const snapshot = {
    projectId,
    period,
    revenueRecord: pick(revenue, ['recordId', 'revenueAmount', 'source', 'syncBatchId']),
    laborRecord: pick(labor, ['allocationId', 'laborAmount', 'source']),
    taxFeeRecord: pick(taxFee, ['feeId', 'taxFeeAmount', 'source']),
    claimCount: approvedClaims.length,
    rule: pick(rule, ['version', 'effectiveFrom', 'ranges'])
  };

  let existing = await services.store.findOne('project_settlements', { projectId, period });
  if (existing) {
    existing = await services.store.updateById('project_settlements', 'settlementId', existing.settlementId, {
      ...settlement,
      ruleVersion: rule.version,
      snapshotJson: snapshot,
      generatedBy: currentUser.userId,
      generatedAt: services.now(),
      updatedAt: services.now()
    });
  } else {
    existing = await services.store.insert('project_settlements', {
      settlementId: services.createId('settlement'),
      projectId,
      period,
      ...settlement,
      ruleVersion: rule.version,
      snapshotJson: snapshot,
      generatedBy: currentUser.userId,
      generatedAt: services.now(),
      createdAt: services.now(),
      updatedAt: services.now()
    });
  }

  await writeOperationLog(services, {
    action: 'settlement.generate',
    userId: currentUser.userId,
    targetType: 'project_settlement',
    targetId: existing.settlementId,
    payload: {
      projectId,
      period,
      profit: existing.profit,
      commissionAmount: existing.commissionAmount
    }
  });

  return {
    ok: true,
    settlement: existing
  };
}

async function getSettlementDetail(event, services) {
  const currentUser = await getCurrentUser(event, services);
  assertFinanceOrAdmin(currentUser);

  const settlementId = String(event.settlementId || '').trim();
  const projectId = String(event.projectId || '').trim();
  const period = normalizePeriod(event.period);

  assert(settlementId || (projectId && period), '请提供 settlementId 或 projectId+period');

  let settlement;
  if (settlementId) {
    settlement = await services.store.findOne('project_settlements', { settlementId });
  } else {
    settlement = await services.store.findOne('project_settlements', { projectId, period });
  }

  assert(settlement, '结算记录不存在', 'NOT_FOUND', 404);

  return {
    ok: true,
    settlement
  };
}

async function listClaims(event, services) {
  const currentUser = await getCurrentUser(event, services);
  const scope = String(event.scope || 'mine').trim();
  const statusFilter = String(event.status || '').trim();
  const projectIdFilter = String(event.projectId || '').trim();
  const periodFilter = normalizePeriod(event.period || '');

  if (scope === 'pending' || scope === 'all') {
    assertFinanceOrAdmin(currentUser);
  }

  let claims = await services.store.list('expense_claims');

  if (scope === 'mine') {
    claims = claims.filter((claim) => claim.applicantId === currentUser.userId);
  }
  if (scope === 'pending') {
    claims = claims.filter((claim) => claim.status === ClaimStatus.SUBMITTED);
  }
  if (statusFilter) {
    claims = claims.filter((claim) => claim.status === statusFilter);
  }
  if (projectIdFilter) {
    claims = claims.filter((claim) => claim.projectId === projectIdFilter);
  }
  if (periodFilter) {
    claims = claims.filter((claim) => isDateInPeriod(claim.occurDate, periodFilter));
  }

  claims.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

  const out = claims.map((claim) => pick(claim, [
    'claimId',
    'projectId',
    'claimType',
    'applicantId',
    'amountTotal',
    'taxAmount',
    'status',
    'occurDate',
    'source',
    'updatedAt',
    'createdAt'
  ]));

  return {
    ok: true,
    claims: out
  };
}

async function getClaimDetail(event, services) {
  const currentUser = await getCurrentUser(event, services);
  const claimId = String(event.claimId || '').trim();
  assert(claimId, 'claimId 不能为空');

  const claim = await services.store.findOne('expense_claims', { claimId });
  assert(claim, '报销单不存在', 'NOT_FOUND', 404);

  const canRead = claim.applicantId === currentUser.userId || hasAnyRole(currentUser, [Roles.FINANCE, Roles.ADMIN]);
  assert(canRead, '无权限查看该报销单', 'FORBIDDEN', 403);

  const items = await services.store.findMany('expense_items', { claimId });

  return {
    ok: true,
    claim,
    items
  };
}

async function upsertProjectPeriodData(event, services) {
  const currentUser = await getCurrentUser(event, services);
  assertFinanceOrAdmin(currentUser);

  const projectId = String(event.projectId || '').trim();
  const period = normalizePeriod(event.period);
  assert(projectId, 'projectId 不能为空');
  assert(period, 'period 格式错误，期望 YYYY-MM');
  await ensureProjectExists(services, projectId, currentUser.userId);

  const laborAmount = toNumber(event.laborAmount, NaN);
  const taxFeeAmount = toNumber(event.taxFeeAmount, NaN);
  assert(Number.isFinite(laborAmount) && laborAmount >= 0, 'laborAmount 非法');
  assert(Number.isFinite(taxFeeAmount) && taxFeeAmount >= 0, 'taxFeeAmount 非法');

  const now = services.now();

  const labor = await services.store.upsertOne(
    'project_labor_allocations',
    { projectId, period },
    {
      laborAmount: round2(laborAmount),
      source: 'manual',
      updatedBy: currentUser.userId,
      updatedAt: now
    },
    {
      allocationId: services.createId('labor'),
      createdAt: now
    }
  );

  const taxFee = await services.store.upsertOne(
    'project_tax_fees',
    { projectId, period },
    {
      taxFeeAmount: round2(taxFeeAmount),
      source: 'manual',
      updatedBy: currentUser.userId,
      updatedAt: now
    },
    {
      feeId: services.createId('tax'),
      createdAt: now
    }
  );

  await writeOperationLog(services, {
    action: 'project.period.upsert',
    userId: currentUser.userId,
    targetType: 'project_period',
    targetId: `${projectId}:${period}`,
    payload: {
      laborAmount: round2(laborAmount),
      taxFeeAmount: round2(taxFeeAmount)
    }
  });

  return {
    ok: true,
    labor,
    taxFee
  };
}

async function listProjects(event, services) {
  const currentUser = await getCurrentUser(event, services);
  const includeDisabled = Boolean(event.includeDisabled) && hasAnyRole(currentUser, [Roles.FINANCE, Roles.ADMIN]);
  const keyword = String(event.keyword || '').trim().toLowerCase();

  const projects = await services.store.list('projects');

  const out = projects
    .filter((project) => includeDisabled || project.status !== 'disabled')
    .filter((project) => {
      if (!keyword) {
        return true;
      }
      const id = String(project.projectId || '').toLowerCase();
      const name = String(project.name || '').toLowerCase();
      return id.includes(keyword) || name.includes(keyword);
    })
    .sort((a, b) => String(a.projectId || '').localeCompare(String(b.projectId || '')))
    .map((project) => pick(project, [
      'projectId',
      'name',
      'status',
      'owner',
      'startDate',
      'endDate',
      'source',
      'updatedAt'
    ]));

  return {
    ok: true,
    projects: out
  };
}

async function upsertProject(event, services) {
  const currentUser = await getCurrentUser(event, services);
  assertFinanceOrAdmin(currentUser);

  const projectId = String(event.projectId || '').trim();
  const name = String(event.name || '').trim();
  const owner = String(event.owner || '').trim();
  const status = String(event.status || 'active').trim();
  const startDate = String(event.startDate || '').trim();
  const endDate = String(event.endDate || '').trim();

  assert(projectId, 'projectId 不能为空');
  assert(name, 'name 不能为空');
  assert(['active', 'archived', 'disabled'].includes(status), 'status 非法');

  const now = services.now();
  const existing = await services.store.findOne('projects', { projectId });

  let project;
  if (existing) {
    project = await services.store.updateById('projects', '_id', existing._id, {
      name,
      owner,
      status,
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      updatedBy: currentUser.userId,
      updatedAt: now
    });
  } else {
    project = await services.store.insert('projects', {
      projectId,
      name,
      owner,
      status,
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      source: 'manual',
      createdBy: currentUser.userId,
      updatedBy: currentUser.userId,
      createdAt: now,
      updatedAt: now
    });
  }

  await writeOperationLog(services, {
    action: 'project.upsert',
    userId: currentUser.userId,
    targetType: 'project',
    targetId: projectId,
    payload: {
      name,
      status
    }
  });

  return {
    ok: true,
    project: pick(project, ['projectId', 'name', 'owner', 'status', 'startDate', 'endDate', 'updatedAt'])
  };
}

module.exports = {
  handlers: {
    authLogin,
    createOrUpdateClaim,
    submitClaim,
    approveClaim,
    importPaperClaims,
    pullErpRevenue,
    generateMonthlyReport,
    generateProjectSettlement,
    getSettlementDetail,
    listClaims,
    getClaimDetail,
    upsertProjectPeriodData,
    listProjects,
    upsertProject
  },
  getCurrentUser
};
