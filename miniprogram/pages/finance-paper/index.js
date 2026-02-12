const { callFunction } = require('../../utils/cloud');
const { today, currentPeriod } = require('../../utils/format');
const { fetchProjects, buildProjectPickerData, findProjectIndex } = require('../../utils/projects');

Page({
  data: {
    period: currentPeriod(),
    projectId: '',
    projects: [],
    projectNames: [],
    projectIndex: -1,
    applicantId: '',
    occurDate: today(),
    category: '',
    amount: '',
    taxAmount: '0',
    remark: '',
    fileBase64: '',
    fileName: '',
    lastJob: null
  },

  onShow() {
    this.loadProjects();
  },

  async loadProjects(preferredProjectId = '') {
    try {
      const rows = await fetchProjects({ includeDisabled: false });
      const picker = buildProjectPickerData(rows);
      const target = preferredProjectId || this.data.projectId;
      const index = findProjectIndex(picker.list, target);
      this.setData({
        projects: picker.list,
        projectNames: picker.names,
        projectIndex: index
      });
    } catch (error) {
      wx.showToast({ title: error.message || '项目加载失败', icon: 'none' });
    }
  },

  onProjectChange(e) {
    const idx = Number(e.detail.value);
    const project = this.data.projects[idx] || null;
    this.setData({
      projectIndex: idx,
      projectId: project ? project.projectId : ''
    });
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [field]: e.detail.value.trim() });
  },

  goProjectManage() {
    wx.navigateTo({ url: '/pages/finance-projects/index' });
  },

  async submitManual() {
    if (!this.data.projectId) {
      wx.showToast({ title: '请选择项目', icon: 'none' });
      return;
    }

    const row = {
      projectId: this.data.projectId,
      applicantId: this.data.applicantId,
      occurDate: this.data.occurDate,
      category: this.data.category,
      amount: Number(this.data.amount || 0),
      taxAmount: Number(this.data.taxAmount || 0),
      remark: this.data.remark
    };

    wx.showLoading({ title: '提交中' });
    try {
      const res = await callFunction('importPaperClaims', {
        period: this.data.period,
        mode: 'manual',
        rows: [row]
      });
      this.setData({ lastJob: res.job });
      wx.showToast({ title: '录入完成' });
    } catch (error) {
      wx.showToast({ title: error.message || '录入失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async chooseExcel() {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.chooseMessageFile({
          count: 1,
          type: 'file',
          extension: ['xlsx', 'xls'],
          success: resolve,
          fail: reject
        });
      });

      const file = res.tempFiles[0];
      const base64 = await new Promise((resolve, reject) => {
        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding: 'base64',
          success: (ret) => resolve(ret.data),
          fail: reject
        });
      });

      this.setData({ fileBase64: base64, fileName: file.name || '导入文件.xlsx' });
      wx.showToast({ title: '文件已选择' });
    } catch (error) {
      wx.showToast({ title: '选择文件失败', icon: 'none' });
    }
  },

  async submitExcel() {
    if (!this.data.fileBase64) {
      wx.showToast({ title: '请先选择文件', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '导入中' });
    try {
      const res = await callFunction('importPaperClaims', {
        period: this.data.period,
        mode: 'excel',
        fileBase64: this.data.fileBase64
      });
      this.setData({ lastJob: res.job });
      wx.showToast({ title: '导入完成' });
    } catch (error) {
      wx.showToast({ title: error.message || '导入失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});
