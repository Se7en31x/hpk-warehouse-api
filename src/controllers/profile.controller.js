const profileService = require('../services/profile.service');
const util = require('../utils/response');

const getProfile = async (req, res) => {
  try {
    const profile = await profileService.getProfile(req.user);
    return util.sendResponse(res, 200, 'get profile success', profile);
  } catch (error) {
    return util.sendResponse(res, error?.statusCode || 500, error.message || 'get profile failed');
  }
};

module.exports = { getProfile };
