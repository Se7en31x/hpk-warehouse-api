const repo = require('../repositories/notification.repo');

const parsePage = (v, fallback) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const getFeed = async ({ recipientId, page = 1, limit = 20, unreadOnly = false }) => {
  if (!recipientId) throw new Error('recipient_id is required');

  const safePage = parsePage(page, 1);
  const safeLimit = Math.min(100, Math.max(1, parsePage(limit, 20)));

  const { items, total } = await repo.selectNotificationFeed({
    recipientId,
    page: safePage,
    limit: safeLimit,
    unreadOnly: Boolean(unreadOnly),
  });

  const totalPages = Math.max(1, Math.ceil(total / safeLimit));

  return {
    items: (items || []).map((row) => ({
      id: row.notification_id,
      recipient_row_id: row.id,
      is_read: row.is_read,
      delivered_at: row.delivered_at,
      read_at: row.read_at,
      created_at: row.created_at,
      type: row.notification?.type,
      severity: row.notification?.severity,
      title: row.notification?.title,
      body: row.notification?.body,
      entity_type: row.notification?.entity_type,
      entity_id: row.notification?.entity_id,
      entity_code: row.notification?.entity_code,
      metadata: row.notification?.metadata || null,
      expires_at: row.notification?.expires_at || null,
    })),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
    nextPage: safePage < totalPages ? safePage + 1 : null,
    prevPage: safePage > 1 ? safePage - 1 : null,
  };
};

const getUnreadCount = async (recipientId) => {
  if (!recipientId) throw new Error('recipient_id is required');
  const unread = await repo.countUnread(recipientId);
  return { unread };
};

const markAsRead = async ({ recipientId, notificationId }) => {
  if (!recipientId) throw new Error('recipient_id is required');
  if (!notificationId || Number(notificationId) <= 0) throw new Error('notification id is invalid');

  const result = await repo.markRead({ recipientId, notificationId: Number(notificationId) });
  return {
    updated: result?.count || 0,
    notification_id: Number(notificationId),
  };
};

const markAllAsRead = async (recipientId) => {
  if (!recipientId) throw new Error('recipient_id is required');
  const result = await repo.markAllRead(recipientId);
  return { updated: result?.count || 0 };
};

const createManualNotification = async ({ actorId, recipientIds = [], payload }) => {
  if (!payload?.type || !payload?.title) {
    throw new Error('type and title are required');
  }

  const created = await repo.withTransaction(async (tx) => {
    return repo.createNotification(
      {
        type: payload.type,
        severity: payload.severity || 'INFO',
        title: payload.title,
        body: payload.body || null,
        entity_type: payload.entity_type || null,
        entity_id: payload.entity_id || null,
        entity_code: payload.entity_code || null,
        dedupe_key: payload.dedupe_key || null,
        metadata: payload.metadata || null,
        created_by_id: actorId || null,
        expires_at: payload.expires_at ? new Date(payload.expires_at) : null,
      },
      recipientIds,
      tx
    );
  });

  return {
    id: created.id,
    recipient_count: created.recipients?.length || 0,
    recipient_ids: (created.recipients || []).map((r) => r.recipient_id),
  };
};

const getRecipientIdsByRoles = async (roles = []) => {
  return repo.selectRecipientIdsByRoles(roles);
};

const getExpiringLots = async ({ daysAhead = 7, limit = 200 } = {}) => {
  return repo.selectExpiringLots({ daysAhead, limit });
};

const getLowStockItems = async ({ limit = 200 } = {}) => {
  return repo.selectLowStockItems({ limit });
};

const getOverdueBorrows = async ({ limit = 200 } = {}) => {
  return repo.selectOverdueBorrows({ limit });
};

const createNotificationSafely = async ({ actorId, recipientIds = [], payload }) => {
  try {
    return await createManualNotification({ actorId, recipientIds, payload });
  } catch (e) {
    if (e && e.code === 'P2002' && payload?.dedupe_key) {
      return { id: null, recipient_count: 0, deduped: true };
    }
    throw e;
  }
};

module.exports = {
  getFeed,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createManualNotification,
  createNotificationSafely,
  getRecipientIdsByRoles,
  getExpiringLots,
  getLowStockItems,
  getOverdueBorrows,
};
