const service = require('../services/report.service');

const getPaginationParams = (query) => ({
  page:  Math.max(1, parseInt(query.page)  || 1),
  limit: Math.max(1, parseInt(query.limit) || 20),
});

// --- Item-level Reports ---

const getStockBalanceReport = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { warehouseId, search } = req.query;
    res.json(await service.getStockBalanceReport({ page, limit, warehouseId, search }));
  } catch (e) { next(e); }
};

const WAREHOUSE_ROLES = new Set(['Warehouse', 'Administration', 'Admin', 'warehouse', 'admin']);

const getStockMovementReport = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { dateFrom, dateTo, itemId, warehouseId, search, type } = req.query;
    const userId = req.user?.sub ?? null;
    const isWarehouseStaff = req.user?.role?.name ? WAREHOUSE_ROLES.has(req.user.role.name) : false;
    res.json(await service.getStockMovementReport({
      page, limit, dateFrom, dateTo, itemId, warehouseId, search, type,
      userId, isWarehouseStaff,
    }));
  } catch (e) { next(e); }
};

const getExpiredLotsReport = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { dateTo, warehouseId, search } = req.query;
    res.json(await service.getExpiredLotsReport({ page, limit, dateTo, warehouseId, search }));
  } catch (e) { next(e); }
};

const getStockOutReport = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { dateFrom, dateTo, itemId, warehouseId, search } = req.query;
    res.json(await service.getStockMovementReport({
      page, limit, dateFrom, dateTo, itemId, warehouseId, search, type: 'OUT',
    }));
  } catch (e) { next(e); }
};

const getStockInReport = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { dateFrom, dateTo, itemId, warehouseId, search } = req.query;
    res.json(await service.getStockInItemReport({ page, limit, dateFrom, dateTo, itemId, warehouseId, search }));
  } catch (e) { next(e); }
};

// --- Document-level Reports ---

const getRequisitionReports = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { dateFrom, dateTo, status, type, search, department_name } = req.query;
    res.json(await service.getRequisitionReport({ page, limit, dateFrom, dateTo, status, type, search, department_name }));
  } catch (e) { next(e); }
};

const getStockInReports = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { dateFrom, dateTo, status, type, search } = req.query;
    res.json(await service.getStockInReportHeader({ page, limit, dateFrom, dateTo, status, type, search }));
  } catch (e) { next(e); }
};

const getLowStockReport = async (req, res, next) => {
  try {
    const { search, warehouseId } = req.query;
    res.json(await service.getLowStockReport({ search, warehouseId }));
  } catch (e) { next(e); }
};

// --- New Reports ---

const getReusableItemsReport = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { search, status, condition, departmentId } = req.query;
    res.json(await service.getReusableItemsReport({ page, limit, search, status, condition, departmentId }));
  } catch (e) { next(e); }
};

const getAssetReport = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { search, status, departmentId } = req.query;
    res.json(await service.getAssetReport({ page, limit, search, status, departmentId }));
  } catch (e) { next(e); }
};

const getNearExpiryReport = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { daysAhead = 90, warehouseId, search } = req.query;
    res.json(await service.getNearExpiryReport({ page, limit, daysAhead: Number(daysAhead), warehouseId, search }));
  } catch (e) { next(e); }
};

const getInventoryBalanceSummary = async (req, res, next) => {
  try {
    const { search, warehouseId, categoryId } = req.query;
    res.json(await service.getInventoryBalanceSummary({ search, warehouseId, categoryId }));
  } catch (e) { next(e); }
};

module.exports = {
  getStockBalanceReport,
  getLowStockReport,
  getStockMovementReport,
  getExpiredLotsReport,
  getStockOutReport,
  getStockInReport,
  getRequisitionReports,
  getStockInReports,
  getReusableItemsReport,
  getAssetReport,
  getNearExpiryReport,
  getInventoryBalanceSummary,
};
