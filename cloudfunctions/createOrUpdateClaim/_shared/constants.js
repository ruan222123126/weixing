'use strict';

const Roles = {
  APPLICANT: 'applicant',
  FINANCE: 'finance',
  ADMIN: 'admin'
};

const ClaimStatus = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  VOID: 'void'
};

const ClaimType = {
  ELECTRONIC: 'electronic',
  PAPER: 'paper'
};

const ClaimSource = {
  MINIAPP_MANUAL: 'miniapp_manual',
  PAPER_MANUAL: 'paper_manual',
  PAPER_EXCEL: 'paper_excel'
};

const ImportJobType = {
  PAPER_EXCEL: 'paper_excel',
  ERP_PULL: 'erp_pull'
};

const ImportJobStatus = {
  PROCESSING: 'processing',
  SUCCESS: 'success',
  PARTIAL_SUCCESS: 'partial_success',
  FAILED: 'failed'
};

const DEFAULT_COMMISSION_RANGES = [
  { min: Number.NEGATIVE_INFINITY, max: 0.1, rate: 0 },
  { min: 0.1, max: 0.2, rate: 0.05 },
  { min: 0.2, max: 0.3, rate: 0.08 },
  { min: 0.3, max: Number.POSITIVE_INFINITY, rate: 0.12 }
];

module.exports = {
  Roles,
  ClaimStatus,
  ClaimType,
  ClaimSource,
  ImportJobType,
  ImportJobStatus,
  DEFAULT_COMMISSION_RANGES
};
