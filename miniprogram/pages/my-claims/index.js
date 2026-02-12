const { callFunction } = require('../../utils/cloud');
const { claimStatusText, claimStatusClass, fmtMoney } = require('../../utils/format');

Page({
  data: {
    loading: false,
    claims: []
  },

  onShow() {
    this.loadClaims();
  },

  async loadClaims() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await callFunction('listClaims', { scope: 'mine' });
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

  goCreate() {
    wx.navigateTo({ url: '/pages/claim-form/index' });
  },

  goDetail(e) {
    const { claimId } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/claim-detail/index?claimId=${claimId}` });
  }
});
