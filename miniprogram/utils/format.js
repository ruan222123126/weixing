function fmtMoney(value) {
  const n = Number(value || 0);
  return n.toFixed(2);
}

function fmtPercent(value) {
  const n = Number(value || 0) * 100;
  return `${n.toFixed(2)}%`;
}

function claimStatusText(status) {
  const map = {
    draft: '草稿',
    submitted: '待审批',
    approved: '已通过',
    rejected: '已驳回',
    void: '已作废'
  };
  return map[status] || status || '-';
}

function claimStatusClass(status) {
  if (status === 'approved') return 'badge-success';
  if (status === 'submitted') return 'badge-warning';
  if (status === 'rejected' || status === 'void') return 'badge-danger';
  return '';
}

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentPeriod() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

module.exports = {
  fmtMoney,
  fmtPercent,
  claimStatusText,
  claimStatusClass,
  today,
  currentPeriod
};
