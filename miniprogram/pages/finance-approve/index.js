const { callFunction } = require('../../utils/cloud');
const { claimStatusText, claimStatusClass, fmtMoney } = require('../../utils/format');

Page({
  data: {
    claims: [],
    loading: false
  },

  onShow() {
    this.loadPending();
  },

  async loadPending() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await callFunction('listClaims', { scope: 'pending' });
      const claims = (res.claims || []).map((item) => ({
        ...item,
        statusText: claimStatusText(item.status),
        statusClass: claimStatusClass(item.status),
        amountText: fmtMoney(item.amountTotal)
      }));
      this.setData({ claims });
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  goDetail(e) {
    const { claimId } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/claim-detail/index?claimId=${claimId}` });
  },

  async fastApprove(e) {
    const { claimId } = e.currentTarget.dataset;
    await this.handleAction(claimId, 'approve');
  },

  async fastReject(e) {
    const { claimId } = e.currentTarget.dataset;
    await this.handleAction(claimId, 'reject', '财务驳回');
  },

  async handleAction(claimId, action, reason) {
    wx.showLoading({ title: '处理中' });
    try {
      await callFunction('approveClaim', { claimId, action, reason });
      wx.showToast({ title: '已处理' });
      await this.loadPending();
    } catch (error) {
      wx.showToast({ title: error.message || '处理失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});
