'use strict';

const repo = require('../repositories/lookup.repo');

// ── Simple in-memory TTL cache (24 h) ────────────────────────────────────────
// Address reference data is static — no need to hit the DB on every request.
const _cache  = new Map();
const TTL_MS  = 24 * 60 * 60 * 1000; // 24 hours

function fromCache(key) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > TTL_MS) { _cache.delete(key); return null; }
    return entry.data;
}
function toCache(key, data) {
    _cache.set(key, { ts: Date.now(), data });
}

// ── Service methods ────────────────────────────────────────────────────────────

/**
 * All provinces as select-option objects.
 * Response shape: [{ id, name }]
 */
async function getProvinces() {
    const cacheKey = 'provinces';
    const cached = fromCache(cacheKey);
    if (cached) return cached;

    const data = await repo.getProvinces();
    toCache(cacheKey, data);
    return data;
}

/**
 * Districts (amphures) that belong to a given province.
 * Response shape: [{ id, name }]
 *
 * @param {string|number} provinceId  2-char province code (e.g. "10" or 10)
 */
async function getDistrictsByProvince(provinceId) {
    if (!provinceId) throw Object.assign(new Error('provinceId is required'), { status: 400 });

    const id       = String(provinceId).padStart(2, '0');
    const cacheKey = `districts:${id}`;
    const cached   = fromCache(cacheKey);
    if (cached) return cached;

    const data = await repo.getDistrictsByProvince(id);
    toCache(cacheKey, data);
    return data;
}

/**
 * Subdistricts (tambons) that belong to a given district, including zip_code.
 * Response shape: [{ id, name, zip_code }]
 *
 * @param {string|number} districtId  4-char district code (e.g. "1001" or 1001)
 */
async function getSubdistrictsByDistrict(districtId) {
    if (!districtId) throw Object.assign(new Error('districtId is required'), { status: 400 });

    const id       = String(districtId).padStart(4, '0');
    const cacheKey = `subdistricts:${id}`;
    const cached   = fromCache(cacheKey);
    if (cached) return cached;

    const data = await repo.getSubdistrictsByDistrict(id);
    toCache(cacheKey, data);
    return data;
}

module.exports = {
    getProvinces,
    getDistrictsByProvince,
    getSubdistrictsByDistrict,
};
