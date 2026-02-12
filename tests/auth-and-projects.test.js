'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { handlers } = require('../cloudfunctions/_shared/handlers');
const { Roles } = require('../cloudfunctions/_shared/constants');
const { createTestServices } = require('./helpers');

test('authLogin 按手机号白名单自动开通财务/管理员', async () => {
  const services = createTestServices();
  services.resolveOpenId = () => 'openid_fin';
  services.config.financePhones = ['13800000001'];
  services.config.adminPhones = ['13800000002'];

  const fin = await handlers.authLogin({ phone: '13800000001', name: '财务A' }, services);
  assert.equal(fin.ok, true);
  assert.equal(fin.user.role, Roles.FINANCE);

  services.resolveOpenId = () => 'openid_admin';
  const admin = await handlers.authLogin({ phone: '13800000002', name: '管理员A' }, services);
  assert.equal(admin.ok, true);
  assert.equal(admin.user.role, Roles.ADMIN);
});

test('upsertProject + listProjects 可维护并查询项目列表', async () => {
  const services = createTestServices();
  await services.store.insert('users', { userId: 'f1', role: Roles.FINANCE, status: 'active' });
  await services.store.insert('users', { userId: 'u1', role: Roles.APPLICANT, status: 'active' });

  const created = await handlers.upsertProject({
    userId: 'f1',
    projectId: 'P9001',
    name: '样板项目',
    owner: '张三',
    status: 'active'
  }, services);

  assert.equal(created.ok, true);
  assert.equal(created.project.projectId, 'P9001');

  const listForApplicant = await handlers.listProjects({ userId: 'u1' }, services);
  assert.equal(listForApplicant.ok, true);
  assert.equal(listForApplicant.projects.length, 1);
  assert.equal(listForApplicant.projects[0].name, '样板项目');

  await handlers.upsertProject({
    userId: 'f1',
    projectId: 'P9001',
    name: '样板项目-停用',
    status: 'disabled'
  }, services);

  const listDefault = await handlers.listProjects({ userId: 'u1' }, services);
  assert.equal(listDefault.projects.length, 0);

  const listDisabled = await handlers.listProjects({ userId: 'f1', includeDisabled: true }, services);
  assert.equal(listDisabled.projects.length, 1);
});
