'use strict';

const XLSX = require('xlsx');
const { AppError } = require('./errors');
const { toNumber } = require('./utils');

const PAPER_IMPORT_COLUMNS = [
  'projectId',
  'applicantId',
  'occurDate',
  'category',
  'amount',
  'taxAmount',
  'remark'
];

function parsePaperClaimsRowsFromBase64(fileBase64) {
  try {
    const buf = Buffer.from(fileBase64, 'base64');
    const wb = XLSX.read(buf, { type: 'buffer' });
    const first = wb.SheetNames[0];
    if (!first) {
      throw new AppError('Excel 中没有可读取的工作表', 'INVALID_EXCEL');
    }
    const sheet = wb.Sheets[first];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    return rows.map((row) => ({
      projectId: String(row.projectId || row['项目ID'] || '').trim(),
      applicantId: String(row.applicantId || row['申请人ID'] || '').trim(),
      occurDate: String(row.occurDate || row['发生日期'] || '').trim(),
      category: String(row.category || row['费用类别'] || '').trim(),
      amount: toNumber(row.amount || row['金额'], NaN),
      taxAmount: toNumber(row.taxAmount || row['税额'], 0),
      remark: String(row.remark || row['备注'] || '').trim()
    }));
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(`Excel 解析失败: ${error.message}`, 'INVALID_EXCEL');
  }
}

function validatePaperImportRow(row, index) {
  const errors = [];
  if (!row.projectId) {
    errors.push('projectId 不能为空');
  }
  if (!row.occurDate) {
    errors.push('occurDate 不能为空');
  }
  if (!row.category) {
    errors.push('category 不能为空');
  }
  if (!Number.isFinite(row.amount) || row.amount <= 0) {
    errors.push('amount 必须大于 0');
  }
  if (!Number.isFinite(row.taxAmount) || row.taxAmount < 0) {
    errors.push('taxAmount 不能小于 0');
  }
  return {
    ok: errors.length === 0,
    errors: errors.map((msg) => `第 ${index + 1} 行: ${msg}`)
  };
}

function buildMonthlyWorkbook({ summaryRows, detailRows, anomalyRows }) {
  const wb = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, summarySheet, '项目汇总');

  const detailSheet = XLSX.utils.json_to_sheet(detailRows);
  XLSX.utils.book_append_sheet(wb, detailSheet, '费用明细');

  const anomalySheet = XLSX.utils.json_to_sheet(anomalyRows);
  XLSX.utils.book_append_sheet(wb, anomalySheet, '异常清单');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return {
    fileName: `monthly_report_${Date.now()}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64: buffer.toString('base64')
  };
}

module.exports = {
  PAPER_IMPORT_COLUMNS,
  parsePaperClaimsRowsFromBase64,
  validatePaperImportRow,
  buildMonthlyWorkbook
};
