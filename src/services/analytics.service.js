const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const addDays = (d, days) => new Date(d.getTime() + days * 24 * 60 * 60 * 1000);

const toDateKey = (d) => {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const toMonthKey = (d) => {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const mondayOfWeek = (d) => {
  const x = startOfDay(d);
  const day = x.getDay(); // 0..6 (Sun..Sat)
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
};

const safeNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

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

async function getLotHealth({ expiryDays }) {
  const now = new Date();
  const threshold = addDays(now, expiryDays);

  const expiringCountPromise = prisma.item_lots.count({
    where: { expired_at: { not: null, lte: threshold }, deleted_at: null },
  });

  // For low stock, we need item.min_stock. Fetch lots with item relation.
  const lots = await prisma.item_lots.findMany({
    where: { deleted_at: null },
    select: {
      id: true,
      quantity: true,
      expired_at: true,
      items: { select: { id: true, min_stock: true } },
    },
  });

  let belowMinimum = 0;
  let nearExpiry = 0;
  for (const lot of lots) {
    const minStock = safeNumber(lot.items?.min_stock);
    const qty = safeNumber(lot.quantity);
    if (minStock > 0 && qty < minStock) belowMinimum += 1;
    if (lot.expired_at && new Date(lot.expired_at) <= threshold) nearExpiry += 1;
  }

  const expiringCount = await expiringCountPromise;
  const total = lots.length;
  const normal = Math.max(0, total - belowMinimum - nearExpiry);

  return {
    totalLots: total,
    belowMinimumLots: belowMinimum,
    nearExpiryLots: expiringCount, // use DB count (more reliable than JS in case of timezone)
    normalLots: normal,
    thresholdDate: threshold.toISOString(),
  };
}

async function getExpiringLotsTop({ expiryDays, limit }) {
  const now = new Date();
  const threshold = addDays(now, expiryDays);

  const rows = await prisma.item_lots.findMany({
    where: { expired_at: { not: null, lte: threshold }, deleted_at: null },
    orderBy: { expired_at: 'asc' },
    take: limit,
    select: {
      id: true,
      lot_code: true,
      quantity: true,
      expired_at: true,
      items: { select: { name: true, code: true } },
      warehouses: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    lot_code: r.lot_code,
    quantity: safeNumber(r.quantity),
    expired_at: r.expired_at ? new Date(r.expired_at).toISOString() : null,
    item_name: r.items?.name || '-',
    item_code: r.items?.code || '-',
    warehouse_name: r.warehouses?.name || '-',
  }));
}

async function getExpiryStats({ expiryDays, months }) {
  const now = new Date();
  const today = startOfDay(now);
  const threshold = addDays(today, expiryDays);

  const expiredCountPromise = prisma.item_lots.count({
    where: { expired_at: { not: null, lt: today }, deleted_at: null },
  });

  // Trend: expired lots per month
  const monthsBack = Math.max(1, months || 6);
  const startMonth = new Date(today.getFullYear(), today.getMonth() - (monthsBack - 1), 1);
  const endMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  const rows = await prisma.item_lots.findMany({
    where: { expired_at: { not: null, gte: startMonth, lt: endMonth }, deleted_at: null },
    select: { expired_at: true },
  });

  const buckets = new Map();
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - (monthsBack - 1) + i, 1);
    buckets.set(toMonthKey(d), { month: toMonthKey(d), expiredLots: 0 });
  }

  for (const r of rows) {
    if (!r.expired_at) continue;
    const key = toMonthKey(r.expired_at);
    if (!buckets.has(key)) continue;
    buckets.get(key).expiredLots += 1;
  }

  const expiredLots = await expiredCountPromise;

  return {
    expiredLots,
    nearExpiryLots: await prisma.item_lots.count({
      where: { expired_at: { not: null, gte: today, lte: threshold }, deleted_at: null },
    }),
    monthlyExpiredTrend: Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month)),
  };
}

async function getLowStockStats({ top = 10 }) {
  const rows = await prisma.items.findMany({
    where: { deleted_at: null, min_stock: { gt: 0 } },
    select: { id: true, code: true, name: true, min_stock: true, current_stock: true },
  });

  const low = rows
    .map((r) => {
      const min = safeNumber(r.min_stock);
      const cur = safeNumber(r.current_stock);
      return {
        id: r.id,
        item_code: r.code,
        item_name: r.name,
        min_stock: min,
        current_stock: cur,
        deficit: Math.max(0, min - cur),
        isLow: min > 0 && cur <= min,
      };
    })
    .filter((x) => x.isLow);

  const count = low.length;
  const topItems = low
    .sort((a, b) => b.deficit - a.deficit)
    .slice(0, top)
    .map(({ isLow, ...rest }) => rest);

  return { lowStockItems: count, topLowStockItems: topItems };
}

async function getStockInMonthly({ months }) {
  const now = new Date();
  const monthsBack = Math.max(1, months || 6);
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const rows = await prisma.receive_header.findMany({
    where: { receive_date: { gte: start, lt: end } },
    select: { receive_date: true, type: true },
  });

  const buckets = new Map();
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1) + i, 1);
    const key = toMonthKey(d);
    buckets.set(key, { month: key, total: 0, byType: {} });
  }

  for (const r of rows) {
    const dt = r.receive_date || now;
    const key = toMonthKey(dt);
    if (!buckets.has(key)) continue;
    const b = buckets.get(key);
    const t = String(r.type || 'UNKNOWN').toUpperCase();
    b.total += 1;
    b.byType[t] = (b.byType[t] || 0) + 1;
  }

  const monthly = Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month));
  const currentMonthKey = toMonthKey(now);
  const thisMonth = buckets.get(currentMonthKey) || { total: 0, byType: {} };

  return { monthly, thisMonth };
}

async function getRequisitionTimeSeries({ weeks, months }) {
  const now = new Date();

  const monthsBack = Math.max(1, months);

  const weekStartDate = mondayOfWeek(now);
  const weekEndDate = endOfDay(addDays(weekStartDate, 6));
  const monthsFrom = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

  const [weeklyRows, monthlyRows] = await Promise.all([
    prisma.requisition_header.findMany({
      where: { created_at: { gte: weekStartDate, lte: weekEndDate } },
      select: { created_at: true, type: true },
    }),
    prisma.requisition_header.findMany({
      where: { created_at: { gte: monthsFrom, lte: now } },
      select: { created_at: true, type: true },
    }),
  ]);

  const weeklyBuckets = new Map();
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStartDate, i);
    const key = toDateKey(d);
    weeklyBuckets.set(key, { weekStart: key, withdraw: 0, borrow: 0, total: 0 });
  }
  for (const r of weeklyRows) {
    const dt = r.created_at || now;
    const key = toDateKey(startOfDay(dt));
    if (!weeklyBuckets.has(key)) continue;
    const bucket = weeklyBuckets.get(key);
    const type = String(r.type || '').toUpperCase();
    if (type === 'BORROW') bucket.borrow += 1;
    else bucket.withdraw += 1;
    bucket.total += 1;
  }
  const weekly = Array.from(weeklyBuckets.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const monthlyBuckets = new Map();
  // prefill all months
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1) + i, 1);
    const key = toMonthKey(d);
    monthlyBuckets.set(key, { month: key, withdraw: 0, borrow: 0, total: 0 });
  }
  for (const r of monthlyRows) {
    const dt = r.created_at || now;
    const key = toMonthKey(dt);
    if (!monthlyBuckets.has(key)) continue;
    const bucket = monthlyBuckets.get(key);
    const type = String(r.type || '').toUpperCase();
    if (type === 'BORROW') bucket.borrow += 1;
    else bucket.withdraw += 1;
    bucket.total += 1;
  }
  const monthly = Array.from(monthlyBuckets.values()).sort((a, b) => a.month.localeCompare(b.month));

  return { weekly, monthly };
}

async function getTopItems({ topItems }) {
  // Aggregate by item_id across requisition_item in recent 90 days
  const now = new Date();
  const from = addDays(now, -90);

  const rows = await prisma.requisition_item.findMany({
    where: { requisition_header: { created_at: { gte: from, lte: now } } },
    select: {
      req_qty: true,
      items: { select: { name: true, code: true } },
    },
  });

  const map = new Map();
  for (const r of rows) {
    const key = r.items?.code || r.items?.name || 'UNKNOWN';
    if (!map.has(key)) map.set(key, { item_code: r.items?.code || '-', item_name: r.items?.name || '-', quantity: 0 });
    map.get(key).quantity += safeNumber(r.req_qty);
  }

  return Array.from(map.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, topItems);
}

async function getDashboardAnalytics({ expiryDays, weeks, months, topItems, expiringLimit }) {
  const [summary, lotHealth, expiringLotsTop, timeSeries, top, expiryStats, lowStockStats, stockIn] = await Promise.all([
    getSummaryCounts(),
    getLotHealth({ expiryDays }),
    getExpiringLotsTop({ expiryDays, limit: expiringLimit }),
    getRequisitionTimeSeries({ weeks, months }),
    getTopItems({ topItems }),
    getExpiryStats({ expiryDays, months }),
    getLowStockStats({ top: 10 }),
    getStockInMonthly({ months }),
  ]);

  return {
    summary,
    lotHealth,
    expiringLotsTop,
    weeklyRequisitions: timeSeries.weekly,
    monthlyRequisitions: timeSeries.monthly,
    topItems: top,
    expiry: expiryStats,
    lowStock: lowStockStats,
    stockIn,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { getDashboardAnalytics };

