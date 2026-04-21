const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// --- Helpers ---
const buildDateRange = (dateFrom, dateTo) => {
  const where = {};
  if (dateFrom && !Number.isNaN(new Date(dateFrom).getTime())) where.gte = new Date(dateFrom);
  if (dateTo && !Number.isNaN(new Date(dateTo).getTime())) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    where.lte = end;
  }
  return Object.keys(where).length ? where : undefined;
};

// --- Queries ---

const findStockBalance = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.items.count({ where }),
    prisma.items.findMany({
      where, skip, take: limit,
      select: {
        id: true, code: true, name: true, current_stock: true, min_stock: true,
        unit:       { select: { name: true } },
        warehouses: { select: { name: true } },
        categories: { select: { name: true } },
      },
    }),
  ]);
  return { total, rows };
};

const findStockMovement = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.stocks_movement.count({ where }),
    prisma.stocks_movement.findMany({
      where, skip, take: limit,
      orderBy: { created_at: 'desc' },
      select: {
        id: true, type: true, quantity: true, created_at: true, note: true,
        created_by: true, created_by_id: true,
        items: {
          select: {
            code: true, name: true,
            unit:       { select: { name: true } },
            warehouses: { select: { name: true } },
          },
        },
      },
    }),
  ]);
  return { total, rows };
};

const findExpiredLots = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.item_lots.count({ where }),
    prisma.item_lots.findMany({
      where, skip, take: limit,
      orderBy: { expired_at: 'asc' },
      select: {
        id: true, lot_code: true, quantity: true, expired_at: true,
        items:      { select: { code: true, name: true, unit: { select: { name: true } }, categories: { select: { name: true } } } },
        warehouses: { select: { name: true } },
      },
    }),
  ]);
  return { total, rows };
};

const findStockInItems = async ({ headerWhere, itemWhere, skip, limit }) => {
  const allHeaders = await prisma.receive_header.findMany({ where: headerWhere, select: { id: true } });
  const headerIds = allHeaders.map(h => h.id);
  const pagedHeaderIds = headerIds.slice(skip, skip + limit);

  const rows = await prisma.receive_item.findMany({
    where: { header_id: { in: pagedHeaderIds }, ...itemWhere },
    include: {
      receive_header: {
        include: { receive_batch: { include: { supplier: true } } },
      },
      items: { include: { unit: true, warehouses: true } },
    },
    orderBy: { id: 'desc' },
  });
  return { total: headerIds.length, rows };
};

const findRequisitionHeaders = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.requisition_header.count({ where }),
    prisma.requisition_header.findMany({
      where, skip, take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        profiles_requisition_header_requester_idToprofiles: true,
        profiles_requisition_header_approver_idToprofiles:  true,
        departments: { select: { id: true, name: true } },
        requisition_item: { include: { items: { include: { categories: true, unit: true } } } },
      },
    }),
  ]);
  return { total, rows };
};

const findStockInHeaders = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.receive_header.count({ where }),
    prisma.receive_header.findMany({
      where, skip, take: limit,
      orderBy: { id: 'desc' },
      include: {
        receive_batch: { include: { supplier: true } },
        receive_item: { include: { items: { include: { categories: true, unit: true, warehouses: true } } } },
      },
    }),
  ]);
  return { total, rows };
};

// --- Low Stock: items with active-lot stock (or current_stock) <= min_stock ---
const findItemsWithMinStock = async ({ warehouseId } = {}) => {
  const now = new Date();
  return prisma.items.findMany({
    where: {
      deleted_at: null,
      status: 'ACTIVE',
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
          status: 'ACTIVE',
          OR: [{ expired_at: null }, { expired_at: { gt: now } }],
        },
        select: { quantity: true },
      },
    },
  });
};

// --- New: Reusable Item Units ---
const findReusableItems = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.reusable_item_units.count({ where }),
    prisma.reusable_item_units.findMany({
      where, skip, take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        items:       { include: { unit: true, categories: true } },
        departments: { select: { id: true, name: true } },
      },
    }),
  ]);
  return { total, rows };
};

// --- New: Medical Assets ---
const findAssets = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.medical_assets.count({ where }),
    prisma.medical_assets.findMany({
      where, skip, take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        items:       { include: { unit: true, categories: true } },
        departments: { select: { id: true, name: true } },
        asset_units: { select: { id: true, unit_no: true, status: true, condition: true } },
      },
    }),
  ]);
  return { total, rows };
};

// --- Helpers ---
const findDepartments = async (query) => prisma.departments.findMany(query);

const findProfilesByIds = async (ids) => {
  if (!ids.length) return new Map();

  // Step 1: fetch profiles + titles in parallel
  const [profiles, titles] = await Promise.all([
    prisma.profiles.findMany({
      where:  { id: { in: ids } },
      select: { id: true, firstname_th: true, lastname_th: true, title_code: true, department_id: true },
    }),
    prisma.lookup_titles.findMany({ select: { title_code: true, short_name: true } }),
  ]);

  // Step 2: collect all unique dept IDs from Int[] arrays, then fetch names
  const allDeptIds = [...new Set(profiles.flatMap(p => p.department_id ?? []))];
  const deptRows = allDeptIds.length
    ? await prisma.departments.findMany({
        where:  { id: { in: allDeptIds } },
        select: { id: true, name: true },
      })
    : [];
  const deptMap = new Map(deptRows.map(d => [d.id, d.name]));

  // Step 3: build final profile map
  const titleMap = new Map(titles.map(t => [t.title_code, t.short_name]));
  const profileMap = new Map();
  profiles.forEach(p => {
    const prefix = p.title_code ? (titleMap.get(p.title_code) ?? '') : '';
    const name   = [prefix, p.firstname_th, p.lastname_th].filter(Boolean).join(' ');
    // Use first dept ID as primary department
    const primaryDeptId  = (p.department_id ?? [])[0] ?? null;
    const departmentName = primaryDeptId ? (deptMap.get(primaryDeptId) ?? null) : null;
    profileMap.set(p.id, { name: name || null, department: departmentName });
  });
  return profileMap;
};

// ── Receive Report ─────────────────────────────────────────────────────────────

const findReceiveReportData = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.receive_item.count({ where }),
    prisma.receive_item.findMany({
      where, skip, take: limit,
      orderBy: { id: 'desc' },
      select: {
        id: true,
        expected_qty: true,
        qty: true,
        cost_price: true,
        lot_code: true,
        items: { select: { id: true, code: true, name: true, unit: { select: { name: true } } } },
        receive_header: {
          select: {
            id: true,
            doc_no: true,
            type: true,
            receive_batch: {
              select: {
                id: true,
                batch_no: true,
                receive_date: true,
                acquisition_type: true,
                supplier: { select: { name: true } },
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
};
