const { callFunction } = require('../../utils/cloud');
const { today } = require('../../utils/format');
const { fetchProjects, buildProjectPickerData, findProjectIndex } = require('../../utils/projects');

function emptyItem() {
  return {
    category: '',
    amount: '',
    taxAmount: '',
    remark: ''
  };
}

Page({
  data: {
    claimId: '',
    projectId: '',
    projects: [],
    projectNames: [],
    projectIndex: -1,
    claimType: 'electronic',
    occurDate: today(),
    costCategory: '',
    attachments: [],
    items: [emptyItem()],
    loading: false
  },

  async onLoad(query) {
    await this.loadProjects();
    if (query.claimId) {
      this.setData({ claimId: query.claimId });
      await this.loadDetail(query.claimId);
    }
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

  async loadDetail(claimId) {
    wx.showLoading({ title: '加载中' });
    try {
      const res = await callFunction('getClaimDetail', { claimId });
      const claim = res.claim || {};
      const items = (res.items && res.items.length ? res.items : [emptyItem()]).map((it) => ({
        category: it.category || '',
        amount: it.amount || '',
        taxAmount: it.taxAmount || '',
        remark: it.remark || ''
      }));
      this.setData({
        projectId: claim.projectId || '',
        claimType: claim.claimType || 'electronic',
        occurDate: String(claim.occurDate || '').slice(0, 10) || today(),
        costCategory: claim.costCategory || '',
        attachments: claim.attachments || [],
        items
      });
      await this.loadProjects(claim.projectId || '');
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
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

  onFieldInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [field]: e.detail.value.trim() });
  },

  onTypeChange(e) {
    const value = e.detail.value === '0' ? 'electronic' : 'paper';
    this.setData({ claimType: value });
  },

  onItemInput(e) {
    const { idx, field } = e.currentTarget.dataset;
    const items = this.data.items.slice();
    items[idx][field] = e.detail.value;
    this.setData({ items });
  },

  addItem() {
    this.setData({ items: [...this.data.items, emptyItem()] });
  },

  removeItem(e) {
    const { idx } = e.currentTarget.dataset;
    if (this.data.items.length <= 1) {
      wx.showToast({ title: '至少保留一条明细', icon: 'none' });
      return;
    }
    const items = this.data.items.slice();
    items.splice(idx, 1);
    this.setData({ items });
  },

  normalizeItems() {
    return this.data.items.map((it) => ({
      category: String(it.category || '').trim(),
      amount: Number(it.amount || 0),
      taxAmount: Number(it.taxAmount || 0),
      remark: String(it.remark || '').trim()
    }));
  },

  buildPayload() {
    return {
      claimId: this.data.claimId || undefined,
      projectId: this.data.projectId,
      claimType: this.data.claimType,
      occurDate: this.data.occurDate,
      costCategory: this.data.costCategory,
      attachments: this.data.attachments,
      items: this.normalizeItems()
    };
  },

  async saveDraft() {
    if (this.data.loading) return;
    if (!this.data.projectId) {
      wx.showToast({ title: '请选择项目', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    wx.showLoading({ title: '保存中' });
    try {
      const res = await callFunction('createOrUpdateClaim', this.buildPayload());
      this.setData({ claimId: res.claim.claimId });
      wx.showToast({ title: '已保存' });
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  },

  async saveAndSubmit() {
    if (this.data.loading) return;
    if (!this.data.projectId) {
      wx.showToast({ title: '请选择项目', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    wx.showLoading({ title: '提交中' });
    try {
      const res = await callFunction('createOrUpdateClaim', this.buildPayload());
      await callFunction('submitClaim', { claimId: res.claim.claimId });
      wx.showToast({ title: '提交成功' });
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/claim-detail/index?claimId=${res.claim.claimId}` });
      }, 300);
    } catch (error) {
      wx.showToast({ title: error.message || '提交失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  }
});
