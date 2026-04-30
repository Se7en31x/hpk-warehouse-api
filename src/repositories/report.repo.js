const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── Helpers ───────────────────────────────────────────────────────────────────

const buildDateRange = (dateFrom, dateTo) => {
  if (!dateFrom && !dateTo) return null;
  const range = {};
  if (dateFrom) range.gte = new Date(dateFrom);
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return range;
};

// ─── Stock Balance (items) ─────────────────────────────────────────────────────

const findStockBalance = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.items.count({ where }),
    prisma.items.findMany({
      where, skip, take: limit,
      orderBy: { name: 'asc' },
      select: {
        id: true, code: true, name: true, type: true,
        current_stock: true, min_stock: true,
        sell_price: true,
        categories: { select: { name: true } },
        warehouses: { select: { id: true, name: true } },
        unit:       { select: { name: true } },
      },
    }),
  ]);
  return { total, rows };
};

// ─── Stock Movement ────────────────────────────────────────────────────────────

const findStockMovement = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.stocks_movement.count({ where }),
    prisma.stocks_movement.findMany({
      where, skip, take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        items: {
          select: {
            id: true, code: true, name: true,
            unit:       { select: { name: true } },
            warehouses: { select: { name: true } },
          },
        },
      },
    }),
  ]);
  return { total, rows };
};

// ─── Expired Lots ──────────────────────────────────────────────────────────────

const findExpiredLots = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.item_lots.count({ where }),
    prisma.item_lots.findMany({
      where, skip, take: limit,
      orderBy: { expired_at: 'asc' },
      include: {
        items: {
          select: {
            id: true, code: true, name: true,
            unit:       { select: { name: true } },
            categories: { select: { name: true } },
          },
        },
        warehouses: { select: { name: true } },
      },
    }),
  ]);
  return { total, rows };
};

// ─── Receive Items (stock-in) ──────────────────────────────────────────────────

const findStockInItems = async ({ skip, limit, headerWhere, itemWhere }) => {
  const allHeaders = await prisma.receive_header.findMany({
    where: headerWhere,
    select: { id: true },
  });
  const headerIds = allHeaders.map(h => h.id);
  const rows = await prisma.receive_item.findMany({
    where: { ...itemWhere, receive_header_id: { in: headerIds } },
    skip, take: limit,
    include: {
      receive_header: { include: { receive_batch: { include: { supplier: true } } } },
      items: { include: { unit: true, categories: true, warehouses: true } },
    },
  });
  return { total: headerIds.length, rows };
};

// ─── Requisition Headers ───────────────────────────────────────────────────────

const findRequisitionHeaders = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.requisition_header.count({ where }),
    prisma.requisition_header.findMany({
      where, skip, take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        profiles_requisition_header_requester_idToprofiles: true,
        profiles_requisition_header_approver_idToprofiles:  true,
        departments:      { select: { id: true, name: true } },
        requisition_item: { include: { items: { include: { categories: true, unit: true } } } },
      },
    }),
  ]);
  return { total, rows };
};

// ─── Receive Headers ───────────────────────────────────────────────────────────

const findStockInHeaders = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.receive_header.count({ where }),
    prisma.receive_header.findMany({
      where, skip, take: limit,
      orderBy: { id: 'desc' },
      include: {
        receive_batch: { include: { supplier: true } },
        receive_item:  { include: { items: { include: { categories: true, unit: true, warehouses: true } } } },
      },
    }),
  ]);
  return { total, rows };
};

// ─── Items with Min Stock (for low-stock alert) ────────────────────────────────

const findItemsWithMinStock = async ({ warehouseId } = {}) => {
  const now = new Date();
  return prisma.items.findMany({
    where: {
      deleted_at: null,
      status:    'ACTIVE',
      min_stock: { gt: 0 },
      ...(warehouseId ? { warehouse_id: warehouseId } : {}),
    },
    orderBy: { current_stock: 'asc' },
    select: {
      id: true, code: true, name: true, type: true,
      current_stock: true, min_stock: true,
      unit:       { select: { name: true } },
      warehouses: { select: { name: true } },
      categories: { select: { name: true } },
      item_lots: {
        where: {
          deleted_at: null,
          quantity:   { gt: 0 },
          OR: [{ expired_at: null }, { expired_at: { gt: now } }],
        },
        select: { quantity: true },
      },
    },
  });
};

// ─── Reusable Item Units ───────────────────────────────────────────────────────

const findReusableItems = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.reusable_item_units.count({ where }),
    prisma.reusable_item_units.findMany({
      where, skip, take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        items:       { include: { categories: true, unit: true } },
        departments: { select: { name: true } },
      },
    }),
  ]);
  return { total, rows };
};

// ─── Medical Assets ────────────────────────────────────────────────────────────

const findAssets = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.medical_assets.count({ where }),
    prisma.medical_assets.findMany({
      where, skip, take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        items:       { include: { categories: true } },
        departments: { select: { name: true } },
        asset_units: true,
      },
    }),
  ]);
  return { total, rows };
};

// ─── Departments ───────────────────────────────────────────────────────────────

const findDepartments = async (query) => prisma.departments.findMany(query);

// ─── Profiles by IDs (batch lookup) ───────────────────────────────────────────

const findProfilesByIds = async (ids) => {
  if (!ids || !ids.length) return new Map();
  const [profiles, titles] = await Promise.all([
    prisma.profiles.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        firstname_th: true, lastname_th: true,
        firstname_en: true, lastname_en: true,
        title_code:   true,
        department_id: true,
      },
    }),
    prisma.lookup_titles.findMany({ select: { title_code: true, short_name: true } }),
  ]);
  const deptIds = [...new Set(
    profiles.flatMap(p => Array.isArray(p.department_id) ? p.department_id : (p.department_id ? [p.department_id] : []))
  )].filter(Boolean);
  const depts = deptIds.length
    ? await prisma.departments.findMany({
        where: { id: { in: deptIds } },
        select: { id: true, name: true },
      })
    : [];
  const titleMap = new Map(titles.map(t => [t.title_code, t.short_name]));
  const deptMap  = new Map(depts.map(d => [d.id, d.name]));
  return new Map(profiles.map(p => {
    const deptId = Array.isArray(p.department_id) ? p.department_id[0] : p.department_id;
    return [p.id, {
      ...p,
      titleShort:     titleMap.get(p.title_code) || '',
      departmentName: deptMap.get(deptId) || '-',
    }];
  }));
};

// ─── Receive Report ────────────────────────────────────────────────────────────

const findReceiveReportData = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.receive_item.count({ where }),
    prisma.receive_item.findMany({
      where, skip, take: limit,
      orderBy: { id: 'desc' },
      include: {
        items: { select: { id: true, code: true, name: true, unit: { select: { name: true } } } },
        receive_header: {
          select: {
            id: true, doc_no: true, type: true,
            receive_batch: {
              select: {
                id: true, batch_no: true, receive_date: true, acquisition_type: true,
                supplier:   { select: { name: true } },
                donor_name: true,
              },
            },
          },
        },
      },
    }),
  ]);
  return { total, rows };
};

// ─── Phase 1: New report repos ─────────────────────────────────────────────────

const findOverdueBorrows = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.requisition_header.count({ where }),
    prisma.requisition_header.findMany({
      where, skip, take: limit,
      orderBy: { due_date: 'asc' },
      include: {
        departments: { select: { id: true, name: true } },
        profiles_requisition_header_requester_idToprofiles: {
          select: {
            firstname_th: true, lastname_th: true,
            firstname_en: true, lastname_en: true,
            title: { select: { name: true, short_name: true } },
          },
        },
        requisition_item: {
          include: {
            items: { select: { id: true, code: true, name: true, unit: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);
  return { total, rows };
};

const findIssuedItemRanking = async ({ dateFrom, dateTo, categoryId, warehouseId }) => {
  const headerWhere = {
    status: { in: ['COMPLETED', 'APPROVED', 'BORROWING'] },
    ...(dateFrom || dateTo ? { request_date: buildDateRange(dateFrom, dateTo) } : {}),
  };
  const grouped = await prisma.requisition_item.groupBy({
    by: ['item_id'],
    where: {
      issued_qty: { gt: 0 },
      items: {
        deleted_at: null,
        ...(categoryId ? { category_id: parseInt(categoryId) } : {}),
        ...(warehouseId ? { warehouse_id: warehouseId } : {}),
      },
      requisition_header: headerWhere,
    },
    _sum:   { issued_qty: true },
    _count: { header_id: true },
    orderBy: { _sum: { issued_qty: 'desc' } },
    take: 200,
  });
  if (!grouped.length) return [];
  const itemIds = grouped.map(g => g.item_id).filter(Boolean);
  const items = await prisma.items.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true, code: true, name: true, current_stock: true,
      categories: { select: { name: true } },
      warehouses:  { select: { name: true } },
      unit:        { select: { name: true } },
      _count: { select: { item_lots: { where: { deleted_at: null, quantity: { gt: 0 } } } } },
    },
  });
  const itemMap = new Map(items.map(i => [i.id, i]));
  return grouped.map((g, idx) => {
    const item = itemMap.get(g.item_id);
    return {
      rank:         idx + 1,
      itemId:       g.item_id,
      code:         item?.code || '-',
      name:         item?.name || '-',
      category:     item?.categories?.name || '-',
      warehouse:    item?.warehouses?.name || '-',
      unit:         item?.unit?.name || '-',
      lotCount:     item?._count?.item_lots ?? 0,
      currentStock: Number(item?.current_stock ?? 0),
      issuedQty:    Number(g._sum.issued_qty ?? 0),
      requestCount: g._count.header_id,
    };
  });
};

const findItemsByStock = async ({ categoryId, warehouseId, skip, limit }) => {
  const where = {
    deleted_at: null,
    status: 'ACTIVE',
    ...(categoryId  ? { category_id: parseInt(categoryId) } : {}),
    ...(warehouseId ? { warehouse_id: warehouseId }         : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.items.count({ where }),
    prisma.items.findMany({
      where, skip, take: limit,
      orderBy: { current_stock: 'desc' },
      select: {
        id: true, code: true, name: true, current_stock: true, min_stock: true,
        categories: { select: { name: true } },
        warehouses:  { select: { name: true } },
        unit:        { select: { name: true } },
        _count: { select: { item_lots: { where: { deleted_at: null, quantity: { gt: 0 } } } } },
      },
    }),
  ]);
  return { total, rows };
};

const findInventoryValue = async ({ categoryId, warehouseId }) => {
  return prisma.items.findMany({
    where: {
      deleted_at: null,
      status: 'ACTIVE',
      ...(categoryId  ? { category_id: parseInt(categoryId) } : {}),
      ...(warehouseId ? { warehouse_id: warehouseId }         : {}),
    },
    select: {
      id: true, code: true, name: true, current_stock: true, sell_price: true,
      categories: { select: { name: true } },
      warehouses:  { select: { name: true } },
      unit:        { select: { name: true } },
    },
    orderBy: [{ categories: { name: 'asc' } }, { name: 'asc' }],
  });
};

const findReturnConditionData = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.return_log.count({ where }),
    prisma.return_log.findMany({
      where, skip, take: limit,
      orderBy: { return_date: 'desc' },
      include: {
        requisition_item: {
          include: {
            items: {
              select: {
                id: true, code: true, name: true,
                unit:       { select: { name: true } },
                categories: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
  ]);
  return { total, rows };
};

const findDeptConsumptionData = async ({ dateFrom, dateTo, categoryId }) => {
  return prisma.requisition_item.findMany({
    where: {
      issued_qty: { gt: 0 },
      requisition_header: {
        status: { in: ['COMPLETED', 'APPROVED', 'BORROWING'] },
        ...(dateFrom || dateTo ? { request_date: buildDateRange(dateFrom, dateTo) } : {}),
      },
      items: {
        deleted_at: null,
        ...(categoryId ? { category_id: parseInt(categoryId) } : {}),
      },
    },
    select: {
      issued_qty: true, req_qty: true,
      items: {
        select: {
          id: true, code: true, name: true, sell_price: true,
          unit:       { select: { name: true } },
          categories: { select: { name: true } },
        },
      },
      requisition_header: {
        select: {
          id: true, type: true,
          departments: { select: { id: true, name: true } },
        },
      },
    },
  });
};

// ─── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  prisma,
  buildDateRange,
  findStockBalance,
  findStockMovement,
  findExpiredLots,
  findStockInItems,
  findRequisitionHeaders,
  findStockInHeaders,
  findItemsWithMinStock,
  findReusableItems,
  findAssets,
  findDepartments,
  findProfilesByIds,
  findReceiveReportData,
  // Phase 1
  findOverdueBorrows,
  findIssuedItemRanking,
  findItemsByStock,
  findInventoryValue,
  findReturnConditionData,
  findDeptConsumptionData,
};
