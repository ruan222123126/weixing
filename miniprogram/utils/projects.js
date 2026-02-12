const { callFunction } = require('./cloud');

function toProjectLabel(project) {
  const id = String(project.projectId || '').trim();
  const name = String(project.name || '').trim();
  if (!id && name) {
    return name;
  }
  return name ? `${id} - ${name}` : id;
}

async function fetchProjects(options = {}) {
  const res = await callFunction('listProjects', options);
  return res.projects || [];
}

function buildProjectPickerData(projects, options = {}) {
  const { withAll = false } = options;
  const list = withAll
    ? [{ projectId: '', name: '全部项目', status: 'active' }, ...projects]
    : projects.slice();

  const names = list.map((item) => toProjectLabel(item));
  return { list, names };
}

function findProjectIndex(projects, projectId) {
  if (!projectId) {
    return -1;
  }
  return projects.findIndex((item) => item.projectId === projectId);
}

module.exports = {
  fetchProjects,
  buildProjectPickerData,
  findProjectIndex,
  toProjectLabel
};
