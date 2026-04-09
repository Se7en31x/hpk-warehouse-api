const svc = require('../services/notification.service');
const util = require('../utils/response');
const { runDailyNotificationSweep } = require('../jobs/notification.cron');
const { getIO, buildUserRoom } = require('../utils/socket');

const resolveRecipientId = (req) => {
  return (
    req.user?.user_id ||
    req.user?.id ||
    req.query?.recipient_id ||
    req.body?.recipient_id ||
    null
  );
};

const parseRoles = (raw = '') => {
  return raw
    .toString()
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
};

const resolveWarehouseRecipientIds = async () => {
  const roles = parseRoles(process.env.ROLE_WAREHOUSE_GROUP || '');
  if (!roles.length) return [];
  return svc.getRecipientIdsByRoles(roles);
};

const parseListQuery = (query) => ({
  page: Math.max(1, Number(query.page) || 1),
  limit: Math.min(100, Math.max(1, Number(query.limit) || 20)),
  unreadOnly: query.unread === 'true',
});

const getNotifications = async (req, res) => {
  try {
    const recipientId = resolveRecipientId(req);
    const result = await svc.getFeed({ recipientId, ...parseListQuery(req.query) });
    return util.sendListResponse(res, 200, 'list notifications success', result);
  } catch (e) {
    return util.sendResponse(res, 400, e.message);
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const recipientId = resolveRecipientId(req);
    const result = await svc.getUnreadCount(recipientId);
    return util.sendResponse(res, 200, 'get unread notifications success', result);
  } catch (e) {
    return util.sendResponse(res, 400, e.message);
  }
};

const markRead = async (req, res) => {
  try {
    const recipientId = resolveRecipientId(req);
    const result = await svc.markAsRead({
      recipientId,
      notificationId: req.params.id,
    });
    return util.sendResponse(res, 200, 'mark notification read success', result);
  } catch (e) {
    return util.sendResponse(res, 400, e.message);
  }
};

const markAllRead = async (req, res) => {
  try {
    const recipientId = resolveRecipientId(req);
    const result = await svc.markAllAsRead(recipientId);
    return util.sendResponse(res, 200, 'mark all notifications read success', result);
  } catch (e) {
    return util.sendResponse(res, 400, e.message);
  }
};

const createNotification = async (req, res) => {
  try {
    const actorId = req.user?.user_id || req.user?.id || null;
    const recipientIds = Array.isArray(req.body?.recipient_ids) ? req.body.recipient_ids : [];

    const result = await svc.createManualNotification({
      actorId,
      recipientIds,
      payload: req.body || {},
    });

    const io = getIO();
    const targets = Array.isArray(result.recipient_ids) ? result.recipient_ids : [];
    if (targets.length) {
      targets.forEach((uid) => io.to(buildUserRoom(uid)).emit('REFRESH_DATA', 'NOTIFICATIONS'));
    } else {
      req.io.emit('REFRESH_DATA', 'NOTIFICATIONS');
    }

    return util.sendMutationResponse(res, 201, 'create notification success', result.id);
  } catch (e) {
    return util.sendResponse(res, 400, e.message);
  }
};

const runNotificationJobs = async (req, res) => {
  try {
    const triggerKey = (process.env.CRON_TRIGGER_KEY || '').toString().trim();
    const provided = (req.headers['x-cron-key'] || '').toString().trim();

    if (triggerKey && provided !== triggerKey) {
      return util.sendResponse(res, 403, 'invalid cron trigger key');
    }

    await runDailyNotificationSweep();

    const testMode = req.query?.test === 'true' || req.body?.test === true;
    let testCreated = false;

    if (testMode) {
      const actorId = req.user?.user_id || req.user?.id || null;
      let recipientIds = Array.isArray(req.body?.recipient_ids) && req.body.recipient_ids.length
        ? req.body.recipient_ids
        : [resolveRecipientId(req)].filter(Boolean);

      if (!recipientIds.length) {
        recipientIds = await resolveWarehouseRecipientIds();
      }

      recipientIds = Array.from(new Set((recipientIds || []).filter(Boolean)));

      if (recipientIds.length) {
        await svc.createManualNotification({
          actorId,
          recipientIds,
          payload: {
            type: 'TEST_CRON_TRIGGER',
            severity: 'INFO',
            title: 'ทดสอบแจ้งเตือนจาก run-jobs',
            body: 'หากเห็นรายการนี้ แปลว่าเส้นทางแจ้งเตือนทำงานปกติ',
            entity_type: 'SYSTEM',
            entity_id: 'manual-run-jobs',
            entity_code: 'TEST-NOTI',
            dedupe_key: `TEST_CRON_TRIGGER:${Date.now()}`,
          },
        });

        req.io.emit('REFRESH_DATA', 'NOTIFICATIONS');
        testCreated = true;
      }
    }

    return util.sendResponse(res, 200, 'run notification jobs success', {
      ok: true,
      testMode,
      testCreated,
      note: testMode && !testCreated ? 'test mode enabled but recipient not found' : undefined,
    });
  } catch (e) {
    return util.sendResponse(res, 500, e.message || 'run notification jobs failed');
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  createNotification,
  runNotificationJobs,
};
