const settingsService = require('../services/settings.service');
const util = require('../utils/response');

const getSettings = async (req, res) => {
  try {
    const data = await settingsService.getAll();
    return util.sendResponse(res, 200, 'get settings success', data);
  } catch (err) {
    return util.sendResponse(res, 500, err.message || 'get settings failed');
  }
};

const updateSettings = async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return util.sendResponse(res, 400, 'invalid payload');
    }
    const updatedBy = req.user?.user_id || req.user?.id || null;
    const result = await settingsService.saveAll(payload, updatedBy);
    return util.sendResponse(res, 200, 'settings updated', result);
  } catch (err) {
    return util.sendResponse(res, 500, err.message || 'update settings failed');
  }
};

module.exports = { getSettings, updateSettings };
