const { getSession } = require('../../utils/cloud');

Page({
  data: {
    role: ''
  },

  onShow() {
    const session = getSession() || {};
    const role = session.role || '';
    if (!(role === 'finance' || role === 'admin')) {
      wx.showToast({ title: '仅财务可访问', icon: 'none' });
      wx.navigateBack({ delta: 1 });
      return;
    }
    this.setData({ role });
  },

  goApprove() {
    wx.navigateTo({ url: '/pages/finance-approve/index' });
  },

  goPaper() {
    wx.navigateTo({ url: '/pages/finance-paper/index' });
  },

  goReport() {
    wx.navigateTo({ url: '/pages/finance-report/index' });
  },

  goSettlement() {
    wx.navigateTo({ url: '/pages/finance-settlement/index' });
  },

  goProjects() {
    wx.navigateTo({ url: '/pages/finance-projects/index' });
  }
});
