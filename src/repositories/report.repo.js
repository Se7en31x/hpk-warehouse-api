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
        unit: { select: { name: true } },
        warehouses: { select: { name: true } },
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
        items: { select: { code: true, name: true, unit: { select: { name: true } } } },
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
        items: { select: { code: true, name: true, unit: { select: { name: true } } } },
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
      receive_header: { include: { supplier: true } },
      items: { include: { unit: true, warehouses: true } }
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
        profiles_requisition_header_approver_idToprofiles: true,
        requisition_item: { include: { items: { include: { categories: true, unit: true } } } }
      }
    }),
  ]);
  return { total, rows };
};

const findStockInHeaders = async ({ skip, limit, where }) => {
  const [total, rows] = await Promise.all([
    prisma.receive_header.count({ where }),
    prisma.receive_header.findMany({
      where, skip, take: limit,
      orderBy: { receive_date: 'desc' },
      include: {
        supplier: true,
        receive_item: { include: { items: { include: { categories: true, unit: true, warehouses: true } } } }
      }
    }),
  ]);
  return { total, rows };
};

const findDepartments = async (query) => prisma.departments.findMany(query);

module.exports = {
  prisma,
  buildDateRange,
  findStockBalance,
  findStockMovement,
  findExpiredLots,
  findStockInItems,
  findRequisitionHeaders,
  findStockInHeaders,
  findDepartments,
};