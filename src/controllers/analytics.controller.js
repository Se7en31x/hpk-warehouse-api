const analyticsService = require('../services/analytics.service');
const util = require('../utils/response');

const toInt = (value, fallback) => {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
};

const getDashboardAnalytics = async (req, res) => {
  try {
    const expiryDays = Math.min(3650, Math.max(1, toInt(req.query.expiryDays, 90)));
    const weeks = Math.min(52, Math.max(1, toInt(req.query.weeks, 4)));
    const months = Math.min(36, Math.max(1, toInt(req.query.months, 6)));
    const topItems = Math.min(50, Math.max(1, toInt(req.query.topItems, 5)));
    const expiringLimit = Math.min(200, Math.max(1, toInt(req.query.expiringLimit, 20)));

    const data = await analyticsService.getDashboardAnalytics({
      expiryDays,
      weeks,
      months,
      topItems,
      expiringLimit,
    });

    return util.sendResponse(res, 200, 'dashboard analytics success', data);
  } catch (err) {
    return util.sendResponse(res, 500, err.message || 'dashboard analytics failed');
  }
};

module.exports = { getDashboardAnalytics };

