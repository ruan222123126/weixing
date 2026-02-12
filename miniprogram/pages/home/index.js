const { getSession, clearSession } = require('../../utils/cloud');

Page({
  data: {
    user: null,
    isFinance: false
  },

  onShow() {
    const user = getSession();
    if (!user || !user.userId) {
      wx.reLaunch({ url: '/pages/login/index' });
      return;
    }
    const isFinance = user.role === 'finance' || user.role === 'admin';
    this.setData({ user, isFinance });
  },

  goMyClaims() {
    wx.navigateTo({ url: '/pages/my-claims/index' });
  },

  goClaimForm() {
    wx.navigateTo({ url: '/pages/claim-form/index' });
  },

  goFinanceDashboard() {
    wx.navigateTo({ url: '/pages/finance-dashboard/index' });
  },

  onLogout() {
    clearSession();
    wx.reLaunch({ url: '/pages/login/index' });
  }
});
