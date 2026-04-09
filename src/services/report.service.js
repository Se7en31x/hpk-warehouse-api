const repo = require('../repositories/report.repo');

// --- Helpers ---
const safeNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const toISODate = (d) => (d && !isNaN(new Date(d).getTime()) ? new Date(d).toISOString() : null);
const dateOnly = (d) => (d && !isNaN(new Date(d).getTime()) ? new Date(d).toISOString().split('T')[0] : '');

const formatProfileName = (p) => {
  if (!p) return '-';
  const th = [p.firstname_th, p.lastname_th].filter(Boolean).join(' ');
  const en = [p.firstname_en, p.lastname_en].filter(Boolean).join(' ');
  return th || en || '-';
};

// --- Service Functions ---

const getStockBalanceReport = async ({ page, limit, warehouseId, search }) => {
  const skip = (page - 1) * limit;
  const where = {
    ...(warehouseId && { warehouse_id: warehouseId }),
    ...(search && { name: { contains: search, mode: 'insensitive' } }),
    deleted_at: null,
  };
  const { total, rows } = await repo.findStockBalance({ skip, limit, where });
  return {
    items: rows.map(r => ({
      id: String(r.id),
      code: r.code,
      name: r.name,
      warehouse: r.warehouses?.name || '-',
      currentStock: safeNumber(r.current_stock),
      minStock: safeNumber(r.min_stock),
      unit: r.unit?.name || '-',
    })),
    total, page, limit, totalPages: Math.ceil(total / limit)
  };
};

const getStockMovementReport = async ({ page, limit, dateFrom, dateTo, itemId, warehouseId, search, type }) => {
  const skip = (page - 1) * limit;
  const where = {
    ...(type && { type }),
    ...(dateFrom || dateTo ? { created_at: repo.buildDateRange(dateFrom, dateTo) } : {}),
    ...(itemId && { item_id: itemId }),
    ...(warehouseId && { warehouse_id: warehouseId }),
    ...(search && { note: { contains: search, mode: 'insensitive' } }),
  };
  const { total, rows } = await repo.findStockMovement({ skip, limit, where });
  return {
    items: rows.map(r => ({
      id: String(r.id),
      type: r.type,
      itemCode: r.items?.code || '-',
      itemName: r.items?.name || '-',
      warehouse: '-',
      quantity: safeNumber(r.quantity),
      unit: r.items?.unit?.name || '-',
      date: toISODate(r.created_at),
      note: r.note || '',
    })),
    total, page, limit, totalPages: Math.ceil(total / limit)
  };
};

const getExpiredLotsReport = async ({ page, limit, dateTo, warehouseId, search }) => {
  const skip = (page - 1) * limit;
  const where = {
    ...(dateTo && { expired_at: { lte: new Date(dateTo) } }),
    ...(warehouseId && { warehouse_id: warehouseId }),
    ...(search && { lot_code: { contains: search, mode: 'insensitive' } }),
    deleted_at: null,
  };
  const { total, rows } = await repo.findExpiredLots({ skip, limit, where });
  return {
    items: rows.map(r => ({
      id: String(r.id),
      lotCode: r.lot_code,
      itemCode: r.items?.code || '-',
      itemName: r.items?.name || '-',
      warehouse: r.warehouses?.name || '-',
      quantity: safeNumber(r.quantity),
      unit: r.items?.unit?.name || '-',
      expiredAt: toISODate(r.expired_at),
    })),
    total, page, limit, totalPages: Math.ceil(total / limit)
  };
};

const getStockInItemReport = async ({ page, limit, dateFrom, dateTo, itemId, warehouseId, search }) => {
  const skip = (page - 1) * limit;
  const headerWhere = {
    ...(dateFrom || dateTo ? { receive_date: repo.buildDateRange(dateFrom, dateTo) } : {}),
    ...(warehouseId && { receive_item: { some: { items: { warehouse_id: warehouseId } } } }),
    ...(search && { doc_no: { contains: search, mode: 'insensitive' } }),
  };
  const itemWhere = {
    ...(itemId && { item_id: itemId }),
    ...(warehouseId && { items: { warehouse_id: warehouseId } }),
  };

  const { total, rows } = await repo.findStockInItems({ headerWhere, itemWhere, skip, limit });
  return {
    items: rows.map(r => ({
      id: String(r.id),
      docNo: r.receive_header?.doc_no || '-',
      receiveDate: toISODate(r.receive_header?.receive_date),
      supplier: r.receive_header?.supplier?.name || '-',
      itemCode: r.items?.code || '-',
      itemName: r.items?.name || '-',
      warehouse: r.items?.warehouses?.name || '-',
      quantity: safeNumber(r.qty),
      unit: r.items?.unit?.name || '-',
      lotCode: r.lot_code || '-',
      costPrice: safeNumber(r.cost_price),
      expiredAt: toISODate(r.expired_at),
    })),
    total, page, limit, totalPages: Math.ceil(total / limit)
  };
};

const getRequisitionReport = async ({ page, limit, dateFrom, dateTo, status, type, search, department_name }) => {
  const skip = (page - 1) * limit;
  let deptIds = null;
  if (department_name) {
    const depts = await repo.findDepartments({ where: { name: { contains: department_name, mode: 'insensitive' } }, select: { id: true } });
    deptIds = depts.length ? depts.map(d => d.id) : [-999];
  }

  const where = {
    ...(dateFrom || dateTo ? { created_at: repo.buildDateRange(dateFrom, dateTo) } : {}),
    ...(status && { status }),
    ...(type && { type }),
    ...(deptIds && { department_id: { in: deptIds } }),
    ...(search && { OR: [{ doc_no: { contains: search, mode: 'insensitive' } }, { note: { contains: search, mode: 'insensitive' } }] }),
  };

  const { total, rows } = await repo.findRequisitionHeaders({ skip, limit, where });
  
  // Map Department Names
  const uniqueDeptIds = [...new Set(rows.map(r => r.department_id).filter(Boolean))];
  const deptRows = await repo.findDepartments({ where: { id: { in: uniqueDeptIds } }, select: { id: true, name: true } });
  const deptMap = new Map(deptRows.map(d => [d.id, d.name]));

  const items = rows.map(r => {
    const reportItems = (r.requisition_item || []).map(it => ({
      id: String(it.id),
      itemCode: it.items?.code || '-',
      itemName: it.items?.name || '-',
      quantity: safeNumber(it.req_qty),
      unit: it.items?.unit?.name || '-',
      totalPrice: safeNumber(it.req_qty) * safeNumber(it.items?.sell_price),
    }));

    return {
      id: String(r.id),
      reportNo: r.doc_no || '-',
      date: dateOnly(r.created_at),
      requester: formatProfileName(r.profiles_requisition_header_requester_idToprofiles),
      department: deptMap.get(r.department_id) || '-',
      totalValue: reportItems.reduce((sum, i) => sum + i.totalPrice, 0),
      status: String(r.status || 'PENDING').toUpperCase(),
      items: reportItems,
    };
  });

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

const getStockInReportHeader = async ({ page, limit, dateFrom, dateTo, status, type, search }) => {
  const skip = (page - 1) * limit;
  const where = {
    ...(dateFrom || dateTo ? { receive_date: repo.buildDateRange(dateFrom, dateTo) } : {}),
    ...(status && { status }),
    ...(type && { type }),
    ...(search && {
      OR: [
        { doc_no: { contains: search, mode: 'insensitive' } },
        { note: { contains: search, mode: 'insensitive' } },
        { donor_name: { contains: search, mode: 'insensitive' } }
      ]
    }),
  };

  const { total, rows } = await repo.findStockInHeaders({ skip, limit, where });

  const items = rows.map(r => {
    const reportItems = (r.receive_item || []).map(it => ({
      id: String(it.id),
      itemName: it.items?.name || '-',
      quantity: safeNumber(it.qty),
      unitPrice: safeNumber(it.cost_price),
      totalPrice: safeNumber(it.qty) * safeNumber(it.cost_price),
    }));

    return {
      id: String(r.id),
      reportNo: r.doc_no || '-',
      date: dateOnly(r.receive_date),
      supplier: r.supplier?.name || r.donor_name || '-',
      totalValue: reportItems.reduce((sum, i) => sum + i.totalPrice, 0),
      status: String(r.status || 'PENDING').toUpperCase(),
      items: reportItems,
    };
  });

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

module.exports = {
  getStockBalanceReport,
  getStockMovementReport,
  getExpiredLotsReport,
  getStockInItemReport,
  getRequisitionReport,
  getStockInReportHeader,
};