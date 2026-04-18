const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const withTransaction = async (callback) => {
  return prisma.$transaction((tx) => callback(tx), { timeout: 30000 });
};

const createNotification = async (data, recipientIds = [], tx = prisma) => {
  const recipients = Array.from(new Set((recipientIds || []).filter(Boolean)));
  if (!recipients.length) {
    throw new Error('recipient_ids is required');
  }

  return tx.notifications.create({
    data: {
      type: data.type,
      severity: data.severity || 'INFO',
      title: data.title,
      body: data.body || null,
      entity_type: data.entity_type || null,
      entity_id: data.entity_id || null,
      entity_code: data.entity_code || null,
      dedupe_key: data.dedupe_key || null,
      metadata: data.metadata || null,
      created_by_id: data.created_by_id || null,
      expires_at: data.expires_at || null,
      recipients: {
        createMany: {
          data: recipients.map((id) => ({ recipient_id: id })),
        },
      },
    },
    include: {
      recipients: true,
    },
  });
};

const selectNotificationFeed = async ({ recipientId, page = 1, limit = 20, unreadOnly = false, readOnly = false, severity = null, entityType = null }, tx = prisma) => {
  const notifFilter = {
    OR: [
      { expires_at: null },
      { expires_at: { gt: new Date() } },
    ],
    ...(severity ? { severity: severity.toUpperCase() } : {}),
    ...(entityType ? { entity_type: entityType.toUpperCase() } : {}),
  };

  const where = {
    recipient_id: recipientId,
    notification: notifFilter,
    ...(unreadOnly ? { is_read: false } : readOnly ? { is_read: true } : {}),
  };

  const skip = (page - 1) * limit;

  const [items, total] = await tx.$transaction([
    tx.notification_recipients.findMany({
      where,
      orderBy: [{ created_at: 'desc' }],
      skip,
      take: limit,
      include: {
        notification: true,
      },
    }),
    tx.notification_recipients.count({ where }),
  ]);

  return { items, total };
};

const countUnread = async (recipientId, entityType = null, tx = prisma) => {
  return tx.notification_recipients.count({
    where: {
      recipient_id: recipientId,
      is_read: false,
      notification: {
        OR: [
          { expires_at: null },
          { expires_at: { gt: new Date() } },
        ],
        ...(entityType ? { entity_type: entityType.toUpperCase() } : {}),
      },
    },
  });
};

const markRead = async ({ recipientId, notificationId }, tx = prisma) => {
  return tx.notification_recipients.updateMany({
    where: {
      recipient_id: recipientId,
      notification_id: Number(notificationId),
      is_read: false,
    },
    data: {
      is_read: true,
      read_at: new Date(),
    },
  });
};

const markAllRead = async (recipientId, tx = prisma) => {
  return tx.notification_recipients.updateMany({
    where: {
      recipient_id: recipientId,
      is_read: false,
    },
    data: {
      is_read: true,
      read_at: new Date(),
    },
  });
};

const selectRecipientIdsByRoles = async (roles = [], tx = prisma) => {
  const normalizedRoles = Array.from(
    new Set((roles || []).map((r) => (r || '').toString().trim()).filter(Boolean))
  );
  if (!normalizedRoles.length) return [];

  // Strategy 1: profiles.role_id → roles.role_name_en
  const roleRows = await tx.roles.findMany({
    where: { role_name_en: { in: normalizedRoles } },
    select: { id: true },
  });
  const roleIds = roleRows.map((r) => r.id);

  const profileRows = roleIds.length
    ? await tx.profiles.findMany({
        where: { deleted_at: null, role_id: { in: roleIds } },
        select: { id: true },
      })
    : [];

  // Strategy 2: users.raw_app_meta_data — handles both formats:
  //   { role: "warehouse_staff" }  and  { role: { name: "warehouse_staff" } }
  const placeholders = normalizedRoles.map((_, i) => `$${i + 1}`).join(', ');
  const rawRows = await prisma.$queryRawUnsafe(
    `SELECT id::text
     FROM auth.users
     WHERE deleted_at IS NULL
       AND (
         raw_app_meta_data->>'role' IN (${placeholders})
         OR raw_app_meta_data->'role'->>'name' IN (${placeholders})
       )`,
    ...normalizedRoles, ...normalizedRoles
  );

  const fromProfiles = profileRows.map((r) => r.id);
  const fromRaw = (rawRows || []).map((r) => r.id);

  // Deduplicate and return
  return Array.from(new Set([...fromProfiles, ...fromRaw]));
};

const selectExpiringLots = async ({ daysAhead = 7, limit = 200 }, tx = prisma) => {
  const now = new Date();
  const until = new Date(now);
  until.setDate(until.getDate() + Number(daysAhead || 7));

  return tx.item_lots.findMany({
    where: {
      deleted_at: null,
      quantity: { gt: 0 },
      status: 'ACTIVE',
      expired_at: {
        gte: now,
        lte: until,
      },
    },
    orderBy: [{ expired_at: 'asc' }],
    take: Number(limit) || 200,
    include: {
      items: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      warehouses: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
};

const selectLowStockItems = async ({ limit = 200 }, tx = prisma) => {
  const candidates = await tx.items.findMany({
    where: {
      deleted_at: null,
      status: 'ACTIVE',
      min_stock: { gt: 0 },
    },
    orderBy: [{ current_stock: 'asc' }, { updated_at: 'desc' }],
    select: {
      id: true,
      code: true,
      name: true,
      min_stock: true,
      current_stock: true,
      warehouse_id: true,
      warehouses: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const maxRows = Number(limit) || 200;
  return (candidates || [])
    .filter((row) => Number(row.current_stock || 0) <= Number(row.min_stock || 0))
    .slice(0, maxRows);
};

const selectOverdueBorrows = async ({ limit = 200 }, tx = prisma) => {
  return tx.requisition_header.findMany({
    where: {
      type: 'BORROW',
      status: 'BORROWING',
      due_date: { lt: new Date() },
    },
    orderBy: [{ due_date: 'asc' }],
    take: Number(limit) || 200,
    select: {
      id: true,
      doc_no: true,
      due_date: true,
      requester_id: true,
      borrower_details: {
        select: {
          title_code: true,
          firstname: true,
          lastname: true,
          phone: true,
          lookup_titles: { select: { short_name: true } },
        },
      },
    },
  });
};

module.exports = {
  withTransaction,
  createNotification,
  selectNotificationFeed,
  countUnread,
  markRead,
  markAllRead,
  selectRecipientIdsByRoles,
  selectExpiringLots,
  selectLowStockItems,
  selectOverdueBorrows,
};
