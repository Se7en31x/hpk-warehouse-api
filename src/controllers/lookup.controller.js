'use strict';

const lookupService = require('../services/lookup.service');
const util          = require('../utils/response');

/**
 * GET /v1/lookup/provinces
 * Returns all provinces as [{ id, name }]
 */
const getProvinces = async (req, res) => {
    try {
        const data = await lookupService.getProvinces();
        return util.sendResponse(res, 200, 'get provinces success', data);
    } catch (err) {
        const status = err.status || 500;
        return util.sendResponse(res, status, err.message || 'get provinces failed');
    }
};

/**
 * GET /v1/lookup/districts/:province_id
 * Returns districts for the given province as [{ id, name }]
 */
const getDistricts = async (req, res) => {
    try {
        const data = await lookupService.getDistrictsByProvince(req.params.province_id);
        return util.sendResponse(res, 200, 'get districts success', data);
    } catch (err) {
        const status = err.status || 500;
        return util.sendResponse(res, status, err.message || 'get districts failed');
    }
};

/**
 * GET /v1/lookup/subdistricts/:district_id
 * Returns subdistricts for the given district as [{ id, name }]
 * (zip_code is on the district row, not the subdistrict row)
 */
const getSubdistricts = async (req, res) => {
    try {
        const data = await lookupService.getSubdistrictsByDistrict(req.params.district_id);
        return util.sendResponse(res, 200, 'get subdistricts success', data);
    } catch (err) {
        const status = err.status || 500;
        return util.sendResponse(res, status, err.message || 'get subdistricts failed');
    }
};

/**
 * GET /v1/lookup/titles
 * Returns all title prefixes as [{ title_code, short_name, name }]
 */
const getTitles = async (req, res) => {
    try {
        const data = await lookupService.getTitles();
        return util.sendResponse(res, 200, 'get titles success', data);
    } catch (err) {
        const status = err.status || 500;
        return util.sendResponse(res, status, err.message || 'get titles failed');
    }
};

module.exports = {
    getProvinces,
    getDistricts,
    getSubdistricts,
    getTitles,
};
