const cron = require('node-cron');
const dayjs = require('dayjs');
const notificationService = require('../services/notification.service');
const { getIO, buildUserRoom } = require('../utils/socket');

const TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Bangkok';
const ENABLED = process.env.ENABLE_NOTIFICATION_CRON !== 'false';

// Schedules still read from env (restart required to change cron schedule itself)
const scheduleExpiring = process.env.CRON_EXPIRING_LOTS || '5 0 * * *';
const scheduleLowStock = process.env.CRON_LOW_STOCK || '10 0 * * *';
const scheduleOverdue = process.env.CRON_OVERDUE_BORROW || '15 0 * * *';

// Dynamic setting: read from DB at runtime (no restart needed)
let settingsService = null;
try { settingsService = require('../services/settings.service'); } catch { /* ignore */ }

const getExpiringDaysAhead = async () => {
  try {
    if (settingsService) return await settingsService.getExpiringDays();
  } catch { /* fall back */ }
  return Math.max(1, Number(process.env.NOTIFY_EXPIRING_DAYS || 30));
};

let isRunning = false;

const parseRoles = (raw = '') => {
  return (raw || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
};

const getWarehouseRecipientIds = async () => {
  const warehouseRoles = parseRoles(process.env.ROLE_WAREHOUSE_GROUP || '');
  return notificationService.getRecipientIdsByRoles(warehouseRoles);
};

const emitNotificationRefresh = (recipientIds = []) => {
  try {
    const io = getIO();
    const ids = Array.from(new Set((recipientIds || []).filter(Boolean)));
    if (!ids.length) {
      io.emit('REFRESH_DATA', 'NOTIFICATIONS');
      return;
    }

    ids.forEach((uid) => {
      io.to(buildUserRoom(uid)).emit('REFRESH_DATA', 'NOTIFICATIONS');
    });
  } catch (e) {
    // Socket may not be initialized in tests or one-off scripts.
  }
};

const safeCreate = async ({ actorId = null, recipientIds = [], payload }) => {
  if (!recipientIds.length) return;
  const created = await notificationService.createNotificationSafely({ actorId, recipientIds, payload });
  const targets = Array.isArray(created?.recipient_ids) ? created.recipient_ids : recipientIds;
  emitNotificationRefresh(targets);
};

const runExpiringLotsJob = async () => {
  const recipients = await getWarehouseRecipientIds();
  if (!recipients.length) return;

  const daysAhead = await getExpiringDaysAhead();
  const lots = await notificationService.getExpiringLots({ daysAhead, limit: 300 });
  const todayKey = dayjs().format('YYYY-MM-DD');

  for (const lot of lots) {
    const expiryDate = lot.expired_at ? dayjs(lot.expired_at).format('YYYY-MM-DD') : '-';
    await safeCreate({
      recipientIds: recipients,
      payload: {
        type: 'LOT_EXPIRING',
        severity: 'WARNING',
        title: `ล็อตใกล้หมดอายุ: ${lot.lot_code}`,
        body: `${lot.items?.name || '-'} (${lot.items?.code || '-'}) หมดอายุวันที่ ${expiryDate}`,
        entity_type: 'LOT',
        entity_id: lot.id,
        entity_code: lot.lot_code,
        dedupe_key: `LOT_EXPIRING:${lot.id}:${todayKey}`,
        metadata: {
          lot_id: lot.id,
          lot_code: lot.lot_code,
          item_id: lot.items?.id || null,
          expired_at: lot.expired_at,
          quantity: lot.quantity,
          warehouse_id: lot.warehouses?.id || null,
        },
      },
    });
  }
};

const runLowStockJob = async () => {
  const recipients = await getWarehouseRecipientIds();
  if (!recipients.length) return;

  const items = await notificationService.getLowStockItems({ limit: 300 });
  const todayKey = dayjs().format('YYYY-MM-DD');

  for (const item of items) {
    await safeCreate({
      recipientIds: recipients,
      payload: {
        type: 'LOW_STOCK',
        severity: 'WARNING',
        title: `สต็อกต่ำกว่าขั้นต่ำ: ${item.name}`,
        body: `คงเหลือ ${item.current_stock} (ขั้นต่ำ ${item.min_stock})`,
        entity_type: 'ITEM',
        entity_id: item.id,
        entity_code: item.code,
        dedupe_key: `LOW_STOCK:${item.id}:${todayKey}`,
        metadata: {
          item_id: item.id,
          current_stock: item.current_stock,
          min_stock: item.min_stock,
          warehouse_id: item.warehouse_id || null,
        },
      },
    });
  }
};

const runOverdueBorrowsJob = async () => {
  const warehouseRecipients = await getWarehouseRecipientIds();

  const borrows = await notificationService.getOverdueBorrows({ limit: 300 });
  const todayKey = dayjs().format('YYYY-MM-DD');

  for (const req of borrows) {
    const recipientIds = Array.from(new Set([
      ...warehouseRecipients,
      req.requester_id,
    ].filter(Boolean)));

    if (!recipientIds.length) continue;

    const dueDate = req.due_date ? dayjs(req.due_date).format('YYYY-MM-DD') : '-';

    await safeCreate({
      recipientIds,
      payload: {
        type: 'BORROW_OVERDUE',
        severity: 'CRITICAL',
        title: `รายการยืมเกินกำหนด: ${req.doc_no}`,
        body: `ครบกำหนดคืนวันที่ ${dueDate} (${req.borrower_details?.fullname || 'ไม่ระบุผู้ยืม'})`,
        entity_type: 'REQUISITION',
        entity_id: String(req.id),
        entity_code: req.doc_no,
        dedupe_key: `BORROW_OVERDUE:${req.id}:${todayKey}`,
        metadata: {
          requisition_id: req.id,
          doc_no: req.doc_no,
          due_date: req.due_date,
          requester_id: req.requester_id,
        },
      },
    });
  }
};

const runDailyNotificationSweep = async () => {
  if (isRunning) return;
  isRunning = true;

  try {
    await runExpiringLotsJob();
    await runLowStockJob();
    await runOverdueBorrowsJob();
  } catch (e) {
    console.error('[notification-cron] run failed:', e.message);
  } finally {
    isRunning = false;
  }
};

const startNotificationCronJobs = () => {
  if (!ENABLED) {
    console.log('[notification-cron] disabled by ENABLE_NOTIFICATION_CRON=false');
    return;
  }

  cron.schedule(scheduleExpiring, runExpiringLotsJob, { timezone: TIMEZONE });
  cron.schedule(scheduleLowStock, runLowStockJob, { timezone: TIMEZONE });
  cron.schedule(scheduleOverdue, runOverdueBorrowsJob, { timezone: TIMEZONE });

  const runOnStartup = process.env.CRON_RUN_ON_STARTUP !== 'false';
  if (runOnStartup) {
    setTimeout(() => {
      runDailyNotificationSweep();
    }, 3000);
  }

  console.log('[notification-cron] started', {
    timezone: TIMEZONE,
    scheduleExpiring,
    scheduleLowStock,
    scheduleOverdue,
  });
};

module.exports = {
  startNotificationCronJobs,
  runDailyNotificationSweep,
};
