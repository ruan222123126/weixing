const { callFunction } = require('../../utils/cloud');

Page({
  data: {
    projects: [],
    includeDisabled: false,
    loading: false,
    form: {
      projectId: '',
      name: '',
      owner: '',
      status: 'active'
    },
    statusOptions: ['active', 'archived', 'disabled'],
    statusIndex: 0
  },

  onShow() {
    this.loadProjects();
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`form.${field}`]: e.detail.value.trim() });
  },

  onStatusChange(e) {
    const idx = Number(e.detail.value);
    const status = this.data.statusOptions[idx];
    this.setData({
      statusIndex: idx,
      'form.status': status
    });
  },

  onToggleDisabled(e) {
    this.setData({ includeDisabled: e.detail.value }, () => {
      this.loadProjects();
    });
  },

  async loadProjects() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await callFunction('listProjects', { includeDisabled: this.data.includeDisabled });
      this.setData({ projects: res.projects || [] });
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  fillForm(e) {
    const { projectId, name, owner, status } = e.currentTarget.dataset;
    const idx = this.data.statusOptions.findIndex((v) => v === status);
    this.setData({
      form: {
        projectId,
        name,
        owner: owner || '',
        status
      },
      statusIndex: idx < 0 ? 0 : idx
    });
  },

  resetForm() {
    this.setData({
      form: {
        projectId: '',
        name: '',
        owner: '',
        status: 'active'
      },
      statusIndex: 0
    });
  },

  async saveProject() {
    const { projectId, name, owner, status } = this.data.form;
    if (!projectId || !name) {
      wx.showToast({ title: '项目ID和名称必填', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中' });
    try {
      await callFunction('upsertProject', { projectId, name, owner, status });
      wx.showToast({ title: '保存成功' });
      this.resetForm();
      await this.loadProjects();
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});
