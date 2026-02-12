const { callFunction, setSession } = require('../../utils/cloud');

Page({
  data: {
    name: '',
    phone: '',
    loading: false
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value.trim() });
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value.trim() });
  },

  async onLogin() {
    const { name, phone, loading } = this.data;
    if (loading) {
      return;
    }
    if (!name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    wx.showLoading({ title: '登录中' });
    try {
      const res = await callFunction('authLogin', { name, phone });
      setSession(res.user);
      wx.reLaunch({ url: '/pages/home/index' });
    } catch (error) {
      wx.showToast({ title: error.message || '登录失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  }
});
