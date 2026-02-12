const { callFunction } = require('../../utils/cloud');
const { currentPeriod } = require('../../utils/format');
const { fetchProjects, buildProjectPickerData, findProjectIndex } = require('../../utils/projects');

Page({
  data: {
    period: currentPeriod(),
    projectId: '',
    projects: [],
    projectNames: [],
    projectIndex: 0,
    stats: null,
    fileName: ''
  },

  onShow() {
    this.loadProjects();
  },

  async loadProjects(preferredProjectId = '') {
    try {
      const rows = await fetchProjects({ includeDisabled: true });
      const picker = buildProjectPickerData(rows, { withAll: true });
      const target = preferredProjectId || this.data.projectId;
      const index = target ? findProjectIndex(picker.list, target) : 0;
      this.setData({
        projects: picker.list,
        projectNames: picker.names,
        projectIndex: index < 0 ? 0 : index,
        projectId: index > 0 ? picker.list[index].projectId : ''
      });
    } catch (error) {
      wx.showToast({ title: error.message || '项目加载失败', icon: 'none' });
    }
  },

  onProjectChange(e) {
    const idx = Number(e.detail.value);
    const project = this.data.projects[idx] || { projectId: '' };
    this.setData({
      projectIndex: idx,
      projectId: project.projectId || ''
    });
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [field]: e.detail.value.trim() });
  },

  async generateReport() {
    wx.showLoading({ title: '生成中' });
    try {
      const res = await callFunction('generateMonthlyReport', {
        period: this.data.period,
        projectId: this.data.projectId || undefined,
        includeFile: true
      });

      this.setData({
        stats: res.stats,
        fileName: res.fileName
      });

      const filePath = `${wx.env.USER_DATA_PATH}/${res.fileName}`;
      await new Promise((resolve, reject) => {
        wx.getFileSystemManager().writeFile({
          filePath,
          data: res.fileBase64,
          encoding: 'base64',
          success: resolve,
          fail: reject
        });
      });

      await new Promise((resolve, reject) => {
        wx.openDocument({
          filePath,
          showMenu: true,
          success: resolve,
          fail: reject
        });
      });
    } catch (error) {
      wx.showToast({ title: error.message || '生成失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});
