const repo = require('../repositories/report.repo');

// --- Helpers ---
const safeNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const toISODate  = (d) => (d && !isNaN(new Date(d).getTime()) ? new Date(d).toISOString() : null);
const dateOnly   = (d) => (d && !isNaN(new Date(d).getTime()) ? new Date(d).toISOString().split('T')[0] : '');
const UUID_RE    = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const formatProfileName = (p) => {
  if (!p) return '-';
  const th = [p.firstname_th, p.lastname_th].filter(Boolean).join(' ');
  const en = [p.firstname_en, p.lastname_en].filter(Boolean).join(' ');
  return th || en || '-';
};

const paginate = (page, limit) => ({
  skip: (page - 1) * limit,
  totalPages: (total) => Math.max(1, Math.ceil(total / limit)),
});

// --- Service Functions ---

const getStockBalanceReport = async ({ page, limit, warehouseId, search }) => {
  const { skip, totalPages } = paginate(page, limit);
  const where = {
    ...(warehouseId && { warehouse_id: warehouseId }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ],
    }),
    deleted_at: null,
  };
  const { total, rows } = await repo.findStockBalance({ skip, limit, where });
  return {
    items: rows.map(r => ({
      id:           String(r.id),
      code:         r.code,
      name:         r.name,
      category:     r.categories?.name || '-',
      warehouse:    r.warehouses?.name || '-',
      currentStock: safeNumber(r.current_stock),
      minStock:     safeNumber(r.min_stock),
      unit:         r.unit?.name || '-',
    })),
    total, page, limit, totalPages: totalPages(total),
  };
};

const getStockMovementReport = async ({ page, limit, dateFrom, dateTo, itemId, warehouseId, search, type, userId, isWarehouseStaff }) => {
  const { skip, totalPages } = paginate(page, limit);
  const where = {
    ...(type && { type }),
    ...(dateFrom || dateTo ? { created_at: repo.buildDateRange(dateFrom, dateTo) } : {}),
    ...(itemId && { item_id: itemId }),
    ...(search && {
      OR: [
        { note: { contains: search, mode: 'insensitive' } },
        { items: { name: { contains: search, mode: 'insensitive' } } },
        { items: { code: { contains: search, mode: 'insensitive' } } },
      ],
    }),
    // Access control: non-warehouse staff see only their own records
    ...(!isWarehouseStaff && userId ? { created_by_id: userId } : {}),
  };
  const { total, rows } = await repo.findStockMovement({ skip, limit, where });

  // Batch-resolve operator names + departments from profiles
  const uniqueIds = [...new Set(rows.map(r => r.created_by_id).filter(Boolean))];
  const profileMap = await repo.findProfilesByIds(uniqueIds);

  return {
    items: rows.map(r => {
      const profile = profileMap.get(r.created_by_id);
      return {
        id:             String(r.id),
        type:           r.type,
        itemCode:       r.items?.code || '-',
        itemName:       r.items?.name || '-',
        warehouse:      r.items?.warehouses?.name || '-',
        quantity:       safeNumber(r.quantity),
        unit:           r.items?.unit?.name || '-',
        date:           toISODate(r.created_at),
        operatorName:   profile?.name ?? (r.created_by && !UUID_RE.test(r.created_by) ? r.created_by : '-'),
        departmentName: profile?.department ?? '-',
        note:           r.note || '',
      };
    }),
    total, page, limit, totalPages: totalPages(total),
  };
};

const getExpiredLotsReport = async ({ page, limit, dateTo, warehouseId, search }) => {
  const { skip, totalPages } = paginate(page, limit);
  const where = {
    ...(dateTo && { expired_at: { lte: new Date(dateTo) } }),
    ...(warehouseId && { warehouse_id: warehouseId }),
    ...(search && { lot_code: { contains: search, mode: 'insensitive' } }),
    deleted_at: null,
  };
  const { total, rows } = await repo.findExpiredLots({ skip, limit, where });
  return {
    items: rows.map(r => ({
      id:        String(r.id),
      lotCode:   r.lot_code,
      itemCode:  r.items?.code || '-',
      itemName:  r.items?.name || '-',
      warehouse: r.warehouses?.name || '-',
      quantity:  safeNumber(r.quantity),
      unit:      r.items?.unit?.name || '-',
      expiredAt: toISODate(r.expired_at),
    })),
    total, page, limit, totalPages: totalPages(total),
  };
};

const getStockInItemReport = async ({ page, limit, dateFrom, dateTo, itemId, warehouseId, search }) => {
  const { skip, totalPages } = paginate(page, limit);
  const headerWhere = {
    ...(dateFrom || dateTo ? { receive_batch: { is: { receive_date: repo.buildDateRange(dateFrom, dateTo) } } } : {}),
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
      id:          String(r.id),
      docNo:       r.receive_header?.doc_no || '-',
      receiveDate: toISODate(r.receive_header?.receive_batch?.receive_date),
      supplier:    r.receive_header?.receive_batch?.supplier?.name || r.receive_header?.receive_batch?.donor_name || '-',
      itemCode:    r.items?.code || '-',
      itemName:    r.items?.name || '-',
      warehouse:   r.items?.warehouses?.name || '-',
      quantity:    safeNumber(r.qty),
      unit:        r.items?.unit?.name || '-',
      lotCode:     r.lot_code || '-',
      costPrice:   safeNumber(r.cost_price),
      expiredAt:   toISODate(r.expired_at),
    })),
    total, page, limit, totalPages: totalPages(total),
  };
};

const getRequisitionReport = async ({ page, limit, dateFrom, dateTo, status, type, search, department_name }) => {
  const { skip, totalPages } = paginate(page, limit);
  let deptIds = null;
  if (department_name) {
    const depts = await repo.findDepartments({
      where:  { name: { contains: department_name, mode: 'insensitive' } },
      select: { id: true },
    });
    deptIds = depts.length ? depts.map(d => d.id) : [-999];
  }

  const where = {
    ...(dateFrom || dateTo ? { created_at: repo.buildDateRange(dateFrom, dateTo) } : {}),
    ...(status && { status }),
    ...(type && { type }),
    ...(deptIds && { department_id: { in: deptIds } }),
    ...(search && {
      OR: [
        { doc_no: { contains: search, mode: 'insensitive' } },
        { note:   { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const { total, rows } = await repo.findRequisitionHeaders({ skip, limit, where });

  const items = rows.map(r => {
    const reportItems = (r.requisition_item || []).map(it => ({
      id:         String(it.id),
      itemCode:   it.items?.code || '-',
      itemName:   it.items?.name || '-',
      quantity:   safeNumber(it.req_qty),
      approved:   safeNumber(it.approved_qty),
      issued:     safeNumber(it.issued_qty),
      unit:       it.items?.unit?.name || '-',
      totalPrice: safeNumber(it.req_qty) * safeNumber(it.items?.sell_price),
    }));

    return {
      id:         String(r.id),
      reportNo:   r.doc_no || '-',
      date:       dateOnly(r.request_date || r.created_at),
      requester:  formatProfileName(r.profiles_requisition_header_requester_idToprofiles),
      approver:   formatProfileName(r.profiles_requisition_header_approver_idToprofiles),
      department: r.departments?.name || '-',
      type:       r.type || '-',
      totalValue: reportItems.reduce((sum, i) => sum + i.totalPrice, 0),
      status:     String(r.status || 'PENDING').toUpperCase(),
      items:      reportItems,
      note:       r.note || '',
    };
  });

  return { items, total, page, limit, totalPages: totalPages(total) };
};

const getStockInReportHeader = async ({ page, limit, dateFrom, dateTo, status, type, search }) => {
  const { skip, totalPages } = paginate(page, limit);
  const where = {
    ...(dateFrom || dateTo ? { receive_batch: { is: { receive_date: repo.buildDateRange(dateFrom, dateTo) } } } : {}),
    ...(status && { status }),
    ...(type && { type }),
    ...(search && {
      OR: [
        { doc_no: { contains: search, mode: 'insensitive' } },
        { note:   { contains: search, mode: 'insensitive' } },
        { receive_batch: { is: { donor_name: { contains: search, mode: 'insensitive' } } } },
      ],
    }),
  };

  const { total, rows } = await repo.findStockInHeaders({ skip, limit, where });

  const items = rows.map(r => {
    const reportItems = (r.receive_item || []).map(it => ({
      id:         String(it.id),
      itemName:   it.items?.name || '-',
      quantity:   safeNumber(it.qty),
      unitPrice:  safeNumber(it.cost_price),
      totalPrice: safeNumber(it.qty) * safeNumber(it.cost_price),
    }));

    return {
      id:         String(r.id),
      reportNo:   r.doc_no || '-',
      date:       dateOnly(r.receive_batch?.receive_date),
      supplier:   r.receive_batch?.supplier?.name || r.receive_batch?.donor_name || '-',
      totalValue: reportItems.reduce((sum, i) => sum + i.totalPrice, 0),
      status:     String(r.status || 'PENDING').toUpperCase(),
      items:      reportItems,
    };
  });

  return { items, total, page, limit, totalPages: totalPages(total) };
};

// --- Low Stock Report (dual-mode: sum active lots OR current_stock vs min_stock) ---
const getLowStockReport = async ({ search, warehouseId } = {}) => {
  const items = await repo.findItemsWithMinStock({ warehouseId });

  const result = items
    .map(item => {
      const hasLots = item.item_lots.length > 0;
      // Lot-managed items: sum active non-expired lot quantities
      // Non-lot items: use current_stock as-is
      const availableStock = hasLots
        ? item.item_lots.reduce((sum, lot) => sum + safeNumber(lot.quantity), 0)
        : safeNumber(item.current_stock);

      return {
        id:             item.id,
        code:           item.code,
        name:           item.name,
        type:           item.type || 'CONSUMABLE',
        category:       item.categories?.name || '-',
        warehouse:      item.warehouses?.name || '-',
        unit:           item.unit?.name || '-',
        availableStock,
        currentStock:   safeNumber(item.current_stock),
        minStock:       safeNumber(item.min_stock),
        shortfall:      Math.max(0, safeNumber(item.min_stock) - availableStock),
        hasLots,
      };
    })
    .filter(item => item.availableStock <= item.minStock);

  // Client-side search filter (applied after lot calculation)
  const filtered = search
    ? result.filter(i => {
        const kw = search.toLowerCase();
        return i.code.toLowerCase().includes(kw) || i.name.toLowerCase().includes(kw) || i.category.toLowerCase().includes(kw);
      })
    : result;

  // Sort: out-of-stock first, then by shortfall desc
  filtered.sort((a, b) => {
    if (a.availableStock === 0 && b.availableStock > 0) return -1;
    if (b.availableStock === 0 && a.availableStock > 0) return  1;
    return b.shortfall - a.shortfall;
  });

  return { items: filtered, total: filtered.length };
};

// --- New: Reusable Items Report ---
const getReusableItemsReport = async ({ page, limit, search, status, condition, departmentId }) => {
  const { skip, totalPages } = paginate(page, limit);
  const where = {
    deleted_at: null,
    ...(search && {
      OR: [
        { unit_code: { contains: search, mode: 'insensitive' } },
        { items: { name: { contains: search, mode: 'insensitive' } } },
        { serial_no: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(status && { status }),
    ...(condition && { condition }),
    ...(departmentId && { department_id: Number(departmentId) }),
  };
  const { total, rows } = await repo.findReusableItems({ skip, limit, where });
  return {
    items: rows.map(r => ({
      id:         r.id,
      unitCode:   r.unit_code,
      serialNo:   r.serial_no || '-',
      itemName:   r.items?.name || '-',
      itemCode:   r.items?.code || '-',
      category:   r.items?.categories?.name || '-',
      unit:       r.items?.unit?.name || '-',
      department: r.departments?.name || 'ไม่ระบุแผนก',
      status:     r.status,
      condition:  r.condition,
      note:       r.note || '',
      createdAt:  toISODate(r.created_at),
    })),
    total, page, limit, totalPages: totalPages(total),
  };
};

// --- New: Medical Assets Report ---
const getAssetReport = async ({ page, limit, search, status, departmentId }) => {
  const { skip, totalPages } = paginate(page, limit);
  const where = {
    ...(search && {
      OR: [
        { asset_code: { contains: search, mode: 'insensitive' } },
        { serial_no:  { contains: search, mode: 'insensitive' } },
        { items: { name: { contains: search, mode: 'insensitive' } } },
      ],
    }),
    ...(status && { status }),
    ...(departmentId && { department_id: Number(departmentId) }),
  };
  const { total, rows } = await repo.findAssets({ skip, limit, where });
  return {
    items: rows.map(r => ({
      id:             r.id,
      assetCode:      r.asset_code,
      serialNo:       r.serial_no || '-',
      itemName:       r.items?.name || '-',
      itemCode:       r.items?.code || '-',
      category:       r.items?.categories?.name || '-',
      department:     r.departments?.name || 'ไม่ระบุแผนก',
      status:         r.status,
      purchaseDate:   toISODate(r.purchase_date),
      warrantyExpire: toISODate(r.warranty_expire),
      unitCount:      r.asset_units?.length || 0,
      note:           r.note || '',
      createdAt:      toISODate(r.created_at),
    })),
    total, page, limit, totalPages: totalPages(total),
  };
};

// --- Near-Expiry Report (lots expiring within N days from now) ---
const getNearExpiryReport = async ({ page, limit, daysAhead = 90, warehouseId, search }) => {
  const { skip, totalPages } = paginate(page, limit);
  const now = new Date();
  const future = new Date(now.getTime() + Number(daysAhead) * 24 * 60 * 60 * 1000);

  const where = {
    deleted_at: null,
    quantity:   { gt: 0 },
    expired_at: { gte: now, lte: future },
    ...(warehouseId && { warehouse_id: Number(warehouseId) }),
    ...(search && {
      OR: [
        { lot_code: { contains: search, mode: 'insensitive' } },
        { items:    { name: { contains: search, mode: 'insensitive' } } },
        { items:    { code: { contains: search, mode: 'insensitive' } } },
      ],
    }),
  };

  const { total, rows } = await repo.findExpiredLots({ skip, limit, where });
  return {
    items: rows.map(r => {
      const daysLeft = r.expired_at
        ? Math.ceil((new Date(r.expired_at).getTime() - now.getTime()) / 86400000)
        : null;
      return {
        id:        String(r.id),
        lotCode:   r.lot_code,
        itemCode:  r.items?.code  || '-',
        itemName:  r.items?.name  || '-',
        category:  r.items?.categories ? r.items.categories.name : '-',
        warehouse: r.warehouses?.name || '-',
        quantity:  safeNumber(r.quantity),
        unit:      r.items?.unit?.name || '-',
        expiredAt: toISODate(r.expired_at),
        daysLeft,
      };
    }),
    total, page, limit, totalPages: totalPages(total),
  };
};

// --- Inventory Balance Summary (items grouped by warehouse) ---
const getInventoryBalanceSummary = async ({ search, warehouseId, categoryId }) => {
  const where = {
    deleted_at: null,
    ...(warehouseId && { warehouse_id: Number(warehouseId) }),
    ...(categoryId  && { category_id:  Number(categoryId) }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const rows = await repo.prisma.items.findMany({
    where,
    orderBy: [{ warehouses: { name: 'asc' } }, { name: 'asc' }],
    select: {
      id: true, code: true, name: true, current_stock: true, min_stock: true,
      unit:       { select: { name: true } },
      warehouses: { select: { id: true, name: true } },
      categories: { select: { name: true } },
    },
  });

  // Group by warehouse
  const groupMap = new Map();
  rows.forEach(item => {
    const wName = item.warehouses?.name || 'ไม่ระบุคลัง';
    if (!groupMap.has(wName)) {
      groupMap.set(wName, { warehouse: wName, items: [], totalStock: 0, belowMin: 0 });
    }
    const g = groupMap.get(wName);
    const stock = safeNumber(item.current_stock);
    const minStock = safeNumber(item.min_stock);
    g.items.push({
      id:           String(item.id),
      code:         item.code,
      name:         item.name,
      category:     item.categories?.name || '-',
      unit:         item.unit?.name || '-',
      currentStock: stock,
      minStock,
    });
    g.totalStock += stock;
    if (minStock > 0 && stock <= minStock) g.belowMin++;
  });

  const warehouses = Array.from(groupMap.values()).map(g => ({
    ...g,
    totalItems: g.items.length,
  }));

  return { warehouses, totalItems: rows.length };
};

// ── Receive Report ─────────────────────────────────────────────────────────────

const getReceiveReportData = async ({ page, limit, dateFrom, dateTo, search, supplier }) => {
  const { skip, totalPages } = paginate(page, limit);

  const conditions = [];

  const dateRange = repo.buildDateRange(dateFrom, dateTo);
  if (dateRange) {
    conditions.push({ receive_header: { receive_batch: { receive_date: dateRange } } });
  }

  if (supplier && supplier.trim()) {
    conditions.push({
      OR: [
        { receive_header: { receive_batch: { supplier: { name: { contains: supplier.trim(), mode: 'insensitive' } } } } },
        { receive_header: { receive_batch: { donor_name: { contains: supplier.trim(), mode: 'insensitive' } } } },
      ],
    });
  }

  if (search && search.trim()) {
    conditions.push({
      OR: [
        { items: { name: { contains: search.trim(), mode: 'insensitive' } } },
        { items: { code: { contains: search.trim(), mode: 'insensitive' } } },
        { receive_header: { doc_no: { contains: search.trim(), mode: 'insensitive' } } },
        { receive_header: { receive_batch: { batch_no: { contains: search.trim(), mode: 'insensitive' } } } },
      ],
    });
  }

  const where = conditions.length > 0 ? { AND: conditions } : {};

  const { total, rows } = await repo.findReceiveReportData({ skip, limit, where });

  return {
    items: rows.map(r => {
      const batch = r.receive_header?.receive_batch;
      return {
        id:           r.id,
        receiveDate:  toISODate(batch?.receive_date),
        batchNo:      batch?.batch_no || '-',
        docNo:        r.receive_header?.doc_no || '-',
        type:         r.receive_header?.type || '-',
        supplier:     batch?.supplier?.name || batch?.donor_name || '-',
        itemCode:     r.items?.code || '-',
        itemName:     r.items?.name || '-',
        unit:         r.items?.unit?.name || '-',
        expectedQty:  safeNumber(r.expected_qty),
        qty:          safeNumber(r.qty),
        costPrice:    safeNumber(r.cost_price),
        lotCode:      r.lot_code || '-',
      };
    }),
    total,
    page,
    limit,
    totalPages: totalPages(total),
  };
};

module.exports = {
  getStockBalanceReport,
  getLowStockReport,
  getStockMovementReport,
  getExpiredLotsReport,
  getStockInItemReport,
  getRequisitionReport,
  getStockInReportHeader,
  getReusableItemsReport,
  getAssetReport,
  getNearExpiryReport,
  getInventoryBalanceSummary,
  getReceiveReportData,
};
