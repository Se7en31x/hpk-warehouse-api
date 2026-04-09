const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Default settings that are always available even if not in DB
 */
const DEFAULTS = {
  notify_expiring_days: { value: '30', type: 'number', label: 'แจ้งเตือนล็อตหมดอายุล่วงหน้า (วัน)', group: 'notification' },
  notify_low_stock_enabled: { value: 'true', type: 'boolean', label: 'เปิดแจ้งเตือนสต็อกต่ำ', group: 'notification' },
  notify_overdue_borrow_enabled: { value: 'true', type: 'boolean', label: 'เปิดแจ้งเตือนการยืมเกินกำหนด', group: 'notification' },
  cron_expiring_schedule: { value: '5 0 * * *', type: 'string', label: 'ตารางเวลาตรวจล็อตหมดอายุ (cron)', group: 'schedule' },
  cron_low_stock_schedule: { value: '10 0 * * *', type: 'string', label: 'ตารางเวลาตรวจสต็อกต่ำ (cron)', group: 'schedule' },
  cron_overdue_schedule: { value: '15 0 * * *', type: 'string', label: 'ตารางเวลาตรวจการยืมเกินกำหนด (cron)', group: 'schedule' },
};

const getAllSettings = async () => {
  const rows = await prisma.system_settings.findMany({ orderBy: { key: 'asc' } });

  // Merge with defaults: DB takes priority, fill missing keys with defaults
  const result = { ...DEFAULTS };
  for (const row of rows) {
    if (result[row.key]) {
      result[row.key] = { ...result[row.key], value: row.value, id: row.id, updated_at: row.updated_at };
    }
  }
  return result;
};

const getSettingByKey = async (key) => {
  const row = await prisma.system_settings.findUnique({ where: { key } });
  if (row) return row.value;
  // fall back to default
  return DEFAULTS[key]?.value ?? null;
};

const upsertSetting = async (key, value, updated_by = null) => {
  return prisma.system_settings.upsert({
    where: { key },
    update: { value: String(value), updated_at: new Date(), updated_by },
    create: { key, value: String(value), updated_by },
  });
};

const bulkUpsertSettings = async (settings = {}, updated_by = null) => {
  const ops = Object.entries(settings).map(([key, value]) =>
    prisma.system_settings.upsert({
      where: { key },
      update: { value: String(value), updated_at: new Date(), updated_by },
      create: { key, value: String(value), updated_by },
    })
  );
  return prisma.$transaction(ops);
};

module.exports = {
  DEFAULTS,
  getAllSettings,
  getSettingByKey,
  upsertSetting,
  bulkUpsertSettings,
};
