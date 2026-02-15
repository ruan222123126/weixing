App({
  globalData: {
    envId: 'cloud1-8g512wsr4a9dd559',
    session: null
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用基础库 2.2.3 或以上以支持云能力');
      return;
    }

    wx.cloud.init({
      env: this.globalData.envId,
      traceUser: true
    });

    const cached = wx.getStorageSync('session');
    if (cached && cached.userId) {
      this.globalData.session = cached;
    }
  }
});
