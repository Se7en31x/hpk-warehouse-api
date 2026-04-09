const reusableService = require('../services/reusableItem.service');
const util = require('../utils/response');

const resolveBarcode = async (req, res) => {
  try {
    const value = (req.query?.value || req.body?.value || '').toString().trim();
    const departmentId = req.query?.department_id || req.body?.department_id || null;

    if (!value) {
      return util.sendResponse(res, 400, 'value is required');
    }

    const result = await reusableService.resolveBarcode({ value, departmentId });
    if (!result) {
      return util.sendResponse(res, 404, 'barcode not found');
    }

    return util.sendResponse(res, 200, 'resolve barcode success', result);
  } catch (error) {
    return util.sendResponse(res, error?.statusCode || 500, error.message || 'resolve barcode failed');
  }
};

module.exports = {
  resolveBarcode,
};
