const APP = getApp();

function getSession() {
  return APP.globalData.session || wx.getStorageSync('session') || null;
}

function setSession(session) {
  APP.globalData.session = session;
  wx.setStorageSync('session', session);
}

function clearSession() {
  APP.globalData.session = null;
  wx.removeStorageSync('session');
}

async function callFunction(name, data = {}) {
  const session = getSession();
  const payload = { ...data };
  if (session && session.userId) {
    payload.userId = session.userId;
  }

  const res = await wx.cloud.callFunction({ name, data: payload });
  const result = res.result || {};
  if (!result.ok) {
    const message = (result.error && result.error.message) || '请求失败';
    const err = new Error(message);
    err.payload = result.error || null;
    throw err;
  }
  return result;
}

module.exports = {
  getSession,
  setSession,
  clearSession,
  callFunction
};
