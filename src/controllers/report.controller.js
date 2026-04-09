const service = require('../services/report.service');

// Helper สำหรับจัดการ Pagination พื้นฐาน
const getPaginationParams = (query) => ({
  page: Math.max(1, parseInt(query.page) || 1),
  limit: Math.max(1, parseInt(query.limit) || 10),
});

// --- รายงานแบบแถว (Item-level) ---

const getStockBalanceReport = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { warehouseId, search } = req.query;
    
    const result = await service.getStockBalanceReport({ 
      page, limit, warehouseId, search 
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const getStockMovementReport = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { dateFrom, dateTo, itemId, warehouseId, search } = req.query;

    const result = await service.getStockMovementReport({
      page, limit, dateFrom, dateTo, itemId, warehouseId, search
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const getExpiredLotsReport = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { dateTo, warehouseId, search } = req.query;

    const result = await service.getExpiredLotsReport({
      page, limit, dateTo, warehouseId, search
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const getStockOutReport = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { dateFrom, dateTo, itemId, warehouseId, search } = req.query;

    // ใช้ Movement service แต่ฟิก type เป็น 'OUT'
    const result = await service.getStockMovementReport({
      page, limit, dateFrom, dateTo, itemId, warehouseId, search, type: 'OUT'
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const getStockInReport = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { dateFrom, dateTo, itemId, warehouseId, search } = req.query;

    const result = await service.getStockInItemReport({
      page, limit, dateFrom, dateTo, itemId, warehouseId, search
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

// --- รายงานแบบ Header (Document-level) ---

const getRequisitionReports = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { dateFrom, dateTo, status, type, search, department_name } = req.query;

    const result = await service.getRequisitionReport({
      page, limit, dateFrom, dateTo, status, type, search, department_name
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const getStockInReports = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { dateFrom, dateTo, status, type, search } = req.query;

    const result = await service.getStockInReportHeader({
      page, limit, dateFrom, dateTo, status, type, search
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStockBalanceReport,
  getStockMovementReport,
  getExpiredLotsReport,
  getStockOutReport,
  getStockInReport,
  getRequisitionReports,
  getStockInReports,
};