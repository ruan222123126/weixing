const { callFunction, getSession } = require('../../utils/cloud');
const { claimStatusText, claimStatusClass, fmtMoney } = require('../../utils/format');

Page({
  data: {
    claimId: '',
    claim: null,
    items: [],
    canEdit: false,
    canFinanceAction: false
  },

  async onLoad(query) {
    this.setData({ claimId: query.claimId || '' });
    await this.loadDetail();
  },

  async loadDetail() {
    if (!this.data.claimId) return;
    wx.showLoading({ title: '加载中' });
    try {
      const session = getSession() || {};
      const isFinance = session.role === 'finance' || session.role === 'admin';

      const res = await callFunction('getClaimDetail', { claimId: this.data.claimId });
      const claim = {
        ...res.claim,
        statusText: claimStatusText(res.claim.status),
        statusClass: claimStatusClass(res.claim.status),
        amountText: fmtMoney(res.claim.amountTotal),
        taxText: fmtMoney(res.claim.taxAmount)
      };

      const canEdit = claim.applicantId === session.userId && (claim.status === 'draft' || claim.status === 'rejected');
      const canFinanceAction = isFinance && claim.status === 'submitted';

      this.setData({
        claim,
        items: res.items || [],
        canEdit,
        canFinanceAction
      });
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  goEdit() {
    wx.navigateTo({ url: `/pages/claim-form/index?claimId=${this.data.claimId}` });
  },

  async onSubmit() {
    try {
      await callFunction('submitClaim', { claimId: this.data.claimId });
      wx.showToast({ title: '提交成功' });
      await this.loadDetail();
    } catch (error) {
      wx.showToast({ title: error.message || '提交失败', icon: 'none' });
    }
  },

  async onApprove() {
    await this.financeAction('approve');
  },

  async onReject() {
    await this.financeAction('reject', '财务驳回');
  },

  async financeAction(action, reason) {
    try {
      await callFunction('approveClaim', { claimId: this.data.claimId, action, reason });
      wx.showToast({ title: '处理成功' });
      await this.loadDetail();
    } catch (error) {
      wx.showToast({ title: error.message || '处理失败', icon: 'none' });
    }
  }
});
