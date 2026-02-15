'use strict';

const { createId } = require('./utils');

let initialized = false;
let db = null;

function getDb() {
  if (!initialized) {
    // Lazy require keeps local tests independent from wx-server-sdk.
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
    initialized = true;
  }
  return db;
}

async function fetchAllByWhere(coll, where = {}) {
  const results = [];
  const pageSize = 100;
  let skip = 0;
  while (true) {
    const res = await coll.where(where).skip(skip).limit(pageSize).get();
    const rows = (res && res.data) || [];
    results.push(...rows);
    if (rows.length < pageSize) {
      break;
    }
    skip += pageSize;
  }
  return results;
}

function createCloudStore() {
  return {
    kind: 'cloud',

    async insert(collection, doc) {
      const row = { ...doc };
      if (!row._id) {
        row._id = createId('row');
      }
      const coll = getDb().collection(collection);
      await coll.add({ data: row });
      return row;
    },

    async list(collection) {
      const coll = getDb().collection(collection);
      return fetchAllByWhere(coll, {});
    },

    async findOne(collection, query) {
      const coll = getDb().collection(collection);
      const res = await coll.where(query).limit(1).get();
      const rows = (res && res.data) || [];
      return rows[0] || null;
    },

    async findMany(collection, query) {
      const coll = getDb().collection(collection);
      return fetchAllByWhere(coll, query);
    },

    async updateMany(collection, query, patch) {
      const coll = getDb().collection(collection);
      const res = await coll.where(query).update({ data: patch });
      return (res && res.stats && res.stats.updated) || 0;
    },

    async deleteMany(collection, query) {
      const coll = getDb().collection(collection);
      const res = await coll.where(query).remove();
      return (res && res.stats && res.stats.removed) || 0;
    },

    async updateById(collection, idField, idValue, patch) {
      const coll = getDb().collection(collection);
      await coll.where({ [idField]: idValue }).update({ data: patch });
      return this.findOne(collection, { [idField]: idValue });
    },

    async upsertOne(collection, query, patch, createDoc = null) {
      const existing = await this.findOne(collection, query);
      if (existing) {
        const merged = { ...existing, ...patch };
        await this.updateMany(collection, query, merged);
        return merged;
      }
      const toCreate = { ...query, ...(createDoc || {}), ...patch };
      return this.insert(collection, toCreate);
    }
  };
}

module.exports = {
  createCloudStore
};
