const { callFunction } = require('../../utils/cloud');
const { currentPeriod, fmtMoney, fmtPercent } = require('../../utils/format');
const { fetchProjects, buildProjectPickerData, findProjectIndex } = require('../../utils/projects');

Page({
  data: {
    projectId: '',
    projects: [],
    projectNames: [],
    projectIndex: -1,
    period: currentPeriod(),
    revenueAmount: '',
    laborAmount: '',
    taxFeeAmount: '',
    settlement: null
  },

  onShow() {
    this.loadProjects();
  },

  async loadProjects(preferredProjectId = '') {
    try {
      const rows = await fetchProjects();
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

  async syncRevenue() {
    const { projectId, period, revenueAmount } = this.data;
    if (!projectId || !period) {
      wx.showToast({ title: '请先选择项目和期间', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '同步中' });
    try {
      await callFunction('pullErpRevenue', {
        period,
        rows: [{ projectId, revenueAmount: Number(revenueAmount || 0) }]
      });
      wx.showToast({ title: '收入已同步' });
    } catch (error) {
      wx.showToast({ title: error.message || '同步失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async savePeriodData() {
    const { projectId, period, laborAmount, taxFeeAmount } = this.data;
    if (!projectId || !period) {
      wx.showToast({ title: '请先选择项目和期间', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中' });
    try {
      await callFunction('upsertProjectPeriodData', {
        projectId,
        period,
        laborAmount: Number(laborAmount || 0),
        taxFeeAmount: Number(taxFeeAmount || 0)
      });
      wx.showToast({ title: '人工/税费已保存' });
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async generateSettlement() {
    const { projectId, period } = this.data;
    if (!projectId || !period) {
      wx.showToast({ title: '请先选择项目和期间', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '计算中' });
    try {
      const res = await callFunction('generateProjectSettlement', { projectId, period });
      this.setData({ settlement: this.prettySettlement(res.settlement) });
      wx.showToast({ title: '结算已生成' });
    } catch (error) {
      wx.showToast({ title: error.message || '生成失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async loadSettlement() {
    const { projectId, period } = this.data;
    if (!projectId || !period) {
      wx.showToast({ title: '请先选择项目和期间', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '查询中' });
    try {
      const res = await callFunction('getSettlementDetail', { projectId, period });
      this.setData({ settlement: this.prettySettlement(res.settlement) });
    } catch (error) {
      wx.showToast({ title: error.message || '查询失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  prettySettlement(raw) {
    return {
      ...raw,
      revenueText: fmtMoney(raw.revenue),
      expenseText: fmtMoney(raw.expenseCost),
      taxText: fmtMoney(raw.taxFee),
      laborText: fmtMoney(raw.laborCost),
      profitText: fmtMoney(raw.profit),
      profitRateText: fmtPercent(raw.profitRate),
      commissionRateText: fmtPercent(raw.commissionRate),
      commissionText: fmtMoney(raw.commissionAmount)
    };
  }
});
