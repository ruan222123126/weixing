'use strict';

const { Roles } = require('./constants');
const { AppError } = require('./errors');

function hasAnyRole(user, roles) {
  if (!user || !user.role) {
    return false;
  }
  return roles.includes(user.role);
}

function assertRole(user, roles, message = '无权限执行该操作') {
  if (!hasAnyRole(user, roles)) {
    throw new AppError(message, 'FORBIDDEN', 403);
  }
}

function assertFinanceOrAdmin(user) {
  assertRole(user, [Roles.FINANCE, Roles.ADMIN], '仅财务或管理员可执行');
}

module.exports = {
  hasAnyRole,
  assertRole,
  assertFinanceOrAdmin
};
