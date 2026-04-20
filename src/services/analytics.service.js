const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────────────────────

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay   = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const addDays    = (d, days) => new Date(d.getTime() + days * 86_400_000);
const safeNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const toDateKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
};
const toMonthKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2,'0')}`;
};
const mondayOfWeek = (d) => {
  const x = startOfDay(d);
  const diff = x.getDay() === 0 ? 6 : x.getDay() - 1;
  x.setDate(x.getDate() - diff);
  return x;
};

// ── Simple in-memory TTL cache (60 s) ─────────────────────────────────────────
const _cache = new Map();
const CACHE_TTL_MS = 60_000;

function getFromCache(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { _cache.delete(key); return null; }
  return entry.data;
}
function setInCache(key, data) {
  _cache.set(key, { ts: Date.now(), data });
}

// ── Query functions ────────────────────────────────────────────────────────────

async function getSummaryCounts() {
  const [totalItems, totalLots, totalDepartments, totalSuppliers, totalUsers] = await Promise.all([
    prisma.items.count(),
    prisma.item_lots.count(),
    prisma.departments.count(),
    prisma.supplier.count(),
    prisma.profiles.count(),
  ]);
  return { totalItems, totalLots, totalDepartments, totalSuppliers, totalUsers };
}

// OPTIMIZED: was a full table scan + O(n) JS loop.
// Now: 3 parallel SQL aggregates — zero rows loaded into memory.
async function getLotHealth({ expiryDays }) {
  const now = new Date();
  const threshold = addDays(now, expiryDays);

  const [totalResult, expiringCount, belowMinResult] = await Promise.all([
    // Total active lots
    prisma.item_lots.count({ where: { deleted_at: null } }),

    // Near-expiry count — DB-level filter, uses idx_item_lots_deleted_expired
    prisma.item_lots.count({
      where: { deleted_at: null, expired_at: { not: null, lte: threshold } },
    }),

    // Below-minimum count — requires JOIN with items; raw SQL is the cleanest path
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS cnt
      FROM   inventory.item_lots  l
      JOIN   inventory.items      i ON i.id = l.item_id
      WHERE  l.deleted_at IS NULL
        AND  i.min_stock  > 0
        AND  l.quantity   < i.min_stock
    `,
  ]);

  const total       = safeNumber(totalResult);
  const nearExpiry  = safeNumber(expiringCount);
  const belowMin    = safeNumber(belowMinResult[0]?.cnt ?? 0);
  const normal      = Math.max(0, total - belowMin - nearExpiry);

  return {
    totalLots:        total,
    belowMinimumLots: belowMin,
    nearExpiryLots:   nearExpiry,
    normalLots:       normal,
    thresholdDate:    threshold.toISOString(),
  };
}

async function getExpiringLotsTop({ expiryDays, limit }) {
  const threshold = addDays(new Date(), expiryDays);

  const rows = await prisma.item_lots.findMany({
    where:   { deleted_at: null, expired_at: { not: null, lte: threshold } },
    orderBy: { expired_at: 'asc' },
    take:    limit,
    select: {
      id: true, lot_code: true, quantity: true, expired_at: true,
      items:      { select: { name: true, code: true } },
      warehouses: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id:             r.id,
    lot_code:       r.lot_code,
    quantity:       safeNumber(r.quantity),
    expired_at:     r.expired_at ? new Date(r.expired_at).toISOString() : null,
    item_name:      r.items?.name      || '-',
    item_code:      r.items?.code      || '-',
    warehouse_name: r.warehouses?.name || '-',
  }));
}

// OPTIMIZED: consolidated the 3rd sequential count into the initial Promise.all.
async function getExpiryStats({ expiryDays, months }) {
  const today     = startOfDay(new Date());
  const threshold = addDays(today, expiryDays);
  const monthsBack = Math.max(1, months || 6);
  const startMonth = new Date(today.getFullYear(), today.getMonth() - (monthsBack - 1), 1);
  const endMonth   = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  // All three DB calls run in parallel
  const [expiredLots, nearExpiryLots, rows] = await Promise.all([
    prisma.item_lots.count({
      where: { deleted_at: null, expired_at: { not: null, lt: today } },
    }),
    prisma.item_lots.count({
      where: { deleted_at: null, expired_at: { not: null, gte: today, lte: threshold } },
    }),
    prisma.item_lots.findMany({
      where:  { deleted_at: null, expired_at: { not: null, gte: startMonth, lt: endMonth } },
      select: { expired_at: true },
    }),
  ]);

  // JS bucketing is fine here — at most a few hundred rows over 6 months
  const buckets = new Map();
  for (let i = 0; i < monthsBack; i++) {
    const d   = new Date(today.getFullYear(), today.getMonth() - (monthsBack - 1) + i, 1);
    const key = toMonthKey(d);
    buckets.set(key, { month: key, expiredLots: 0 });
  }
  for (const r of rows) {
    const key = toMonthKey(r.expired_at);
    if (buckets.has(key)) buckets.get(key).expiredLots += 1;
  }

  return {
    expiredLots,
    nearExpiryLots,
    monthlyExpiredTrend: Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month)),
  };
}

// OPTIMIZED: was loading all items + JS filter/sort. Now pushes WHERE + ORDER BY + LIMIT to DB.
async function getLowStockStats({ top = 10 }) {
  const [countResult, topItems] = await Promise.all([
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS cnt
      FROM   inventory.items
      WHERE  deleted_at     IS NULL
        AND  min_stock       > 0
        AND  current_stock  <= min_stock
    `,
    prisma.$queryRaw`
      SELECT id,
             code           AS item_code,
             name           AS item_name,
             min_stock,
             current_stock,
             (min_stock - current_stock) AS deficit
      FROM   inventory.items
      WHERE  deleted_at     IS NULL
        AND  min_stock       > 0
        AND  current_stock  <= min_stock
      ORDER BY deficit DESC
      LIMIT  ${top}
    `,
  ]);

  return {
    lowStockItems:    safeNumber(countResult[0]?.cnt ?? 0),
    topLowStockItems: topItems.map((r) => ({
      id:            r.id,
      item_code:     r.item_code,
      item_name:     r.item_name,
      min_stock:     safeNumber(r.min_stock),
      current_stock: safeNumber(r.current_stock),
      deficit:       safeNumber(r.deficit),
    })),
  };
}

async function getStockInMonthly({ months }) {
  const now        = new Date();
  const monthsBack = Math.max(1, months || 6);
  const start      = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
  const end        = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const rows = await prisma.receive_header.findMany({
    where:  { receive_batch: { is: { receive_date: { gte: start, lt: end } } } },
    select: { type: true, receive_batch: { select: { receive_date: true } } },
  });

  const buckets = new Map();
  for (let i = 0; i < monthsBack; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1) + i, 1);
    const key = toMonthKey(d);
    buckets.set(key, { month: key, total: 0, byType: {} });
  }
  for (const r of rows) {
    const key = toMonthKey(r.receive_batch?.receive_date || now);
    if (!buckets.has(key)) continue;
    const b = buckets.get(key);
    const t = String(r.type || 'UNKNOWN').toUpperCase();
    b.total += 1;
    b.byType[t] = (b.byType[t] || 0) + 1;
  }

  const monthly         = Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month));
  const currentMonthKey = toMonthKey(now);
  const thisMonth       = buckets.get(currentMonthKey) || { total: 0, byType: {} };
  return { monthly, thisMonth };
}

async function getRequisitionTimeSeries({ weeks, months }) {
  const now        = new Date();
  const monthsBack = Math.max(1, months);
  const weekStart  = mondayOfWeek(now);
  const weekEnd    = endOfDay(addDays(weekStart, 6));
  const monthsFrom = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

  const [weeklyRows, monthlyRows] = await Promise.all([
    prisma.requisition_header.findMany({
      where:  { created_at: { gte: weekStart, lte: weekEnd } },
      select: { created_at: true, type: true },
    }),
    prisma.requisition_header.findMany({
      where:  { created_at: { gte: monthsFrom, lte: now } },
      select: { created_at: true, type: true },
    }),
  ]);

  // Weekly buckets
  const weeklyBuckets = new Map();
  for (let i = 0; i < 7; i++) {
    const key = toDateKey(addDays(weekStart, i));
    weeklyBuckets.set(key, { weekStart: key, withdraw: 0, borrow: 0, total: 0 });
  }
  for (const r of weeklyRows) {
    const key    = toDateKey(startOfDay(r.created_at || now));
    const bucket = weeklyBuckets.get(key);
    if (!bucket) continue;
    const type = String(r.type || '').toUpperCase();
    if (type === 'BORROW') bucket.borrow += 1; else bucket.withdraw += 1;
    bucket.total += 1;
  }

  // Monthly buckets
  const monthlyBuckets = new Map();
  for (let i = 0; i < monthsBack; i++) {
    const key = toMonthKey(new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1) + i, 1));
    monthlyBuckets.set(key, { month: key, withdraw: 0, borrow: 0, total: 0 });
  }
  for (const r of monthlyRows) {
    const key    = toMonthKey(r.created_at || now);
    const bucket = monthlyBuckets.get(key);
    if (!bucket) continue;
    const type = String(r.type || '').toUpperCase();
    if (type === 'BORROW') bucket.borrow += 1; else bucket.withdraw += 1;
    bucket.total += 1;
  }

  return {
    weekly:  Array.from(weeklyBuckets.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    monthly: Array.from(monthlyBuckets.values()).sort((a, b) => a.month.localeCompare(b.month)),
  };
}

// OPTIMIZED: was loading all rows + JS aggregation. Now uses Prisma groupBy (SQL GROUP BY + ORDER BY + LIMIT).
async function getTopItems({ topItems }) {
  const now  = new Date();
  const from = addDays(now, -90);

  const grouped = await prisma.requisition_item.groupBy({
    by:    ['item_id'],
    where: {
      item_id: { not: null },
      requisition_header: { created_at: { gte: from, lte: now } },
    },
    _sum:     { req_qty: true },
    orderBy:  { _sum: { req_qty: 'desc' } },
    take:     topItems,
  });

  if (grouped.length === 0) return [];

  const ids      = grouped.map((g) => g.item_id).filter(Boolean);
  const itemRows = await prisma.items.findMany({
    where:  { id: { in: ids } },
    select: { id: true, name: true, code: true },
  });
  const itemMap = new Map(itemRows.map((i) => [i.id, i]));

  return grouped.map((g) => ({
    item_code: itemMap.get(g.item_id)?.code || '-',
    item_name: itemMap.get(g.item_id)?.name || '-',
    quantity:  safeNumber(g._sum?.req_qty),
  }));
}

// ── Main entry point ──────────────────────────────────────────────────────────

async function getDashboardAnalytics({ expiryDays, weeks, months, topItems, expiringLimit }) {
  const cacheKey = `dashboard:${expiryDays}:${weeks}:${months}:${topItems}:${expiringLimit}`;
  const cached   = getFromCache(cacheKey);
  if (cached) return cached;

  const [summary, lotHealth, expiringLotsTop, timeSeries, top, expiryStats, lowStockStats, stockIn] =
    await Promise.all([
      getSummaryCounts(),
      getLotHealth({ expiryDays }),
      getExpiringLotsTop({ expiryDays, limit: expiringLimit }),
      getRequisitionTimeSeries({ weeks, months }),
      getTopItems({ topItems }),
      getExpiryStats({ expiryDays, months }),
      getLowStockStats({ top: 10 }),
      getStockInMonthly({ months }),
    ]);

  const result = {
    summary,
    lotHealth,
    expiringLotsTop,
    weeklyRequisitions:  timeSeries.weekly,
    monthlyRequisitions: timeSeries.monthly,
    topItems:            top,
    expiry:              expiryStats,
    lowStock:            lowStockStats,
    stockIn,
    generatedAt:         new Date().toISOString(),
  };

  setInCache(cacheKey, result);
  return result;
}

module.exports = { getDashboardAnalytics };
