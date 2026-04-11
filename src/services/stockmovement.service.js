const { PrismaClient } = require('@prisma/client');
const stockMovementRepo = require('../repositories/stockmovement.repo');

const prisma = new PrismaClient();

/* ─────────────────────────────────────────────────────────────────────────────
 * Profile enrichment
 *
 * stocks_movement has no Prisma relation to profiles, so we do a single
 * batch lookup after the main query and merge operator_name in the service.
 * ───────────────────────────────────────────────────────────────────────────*/

/**
 * Given a list of movement rows, batch-fetch the linked profiles + lookup_titles
 * and return a Map<uuid → operatorName> for O(1) merge.
 *
 * @param {Array} rows  Raw stocks_movement rows
 * @returns {Promise<Map<string, string>>}
 */
const buildOperatorMap = async (rows) => {
    // Collect unique non-null UUIDs
    const uniqueIds = [
        ...new Set(
            rows
                .map((r) => r.created_by_id)
                .filter((id) => id && typeof id === 'string')
        ),
    ];

    if (uniqueIds.length === 0) return new Map();

    // Batch-fetch profiles
    const profiles = await prisma.profiles.findMany({
        where:  { id: { in: uniqueIds } },
        select: { id: true, firstname_th: true, lastname_th: true, title_code: true },
    });

    // Batch-fetch title short_names for the codes we actually have
    const titleCodes = [...new Set(profiles.map((p) => p.title_code).filter(Boolean))];
    const titleMap   = new Map();
    if (titleCodes.length > 0) {
        const titles = await prisma.lookup_titles.findMany({
            where:  { title_code: { in: titleCodes } },
            select: { title_code: true, short_name: true },
        });
        titles.forEach((t) => titleMap.set(t.title_code, t.short_name ?? null));
    }

    // Build the final operatorName map
    const operatorMap = new Map();
    profiles.forEach((p) => {
        const title = p.title_code ? (titleMap.get(p.title_code) ?? null) : null;
        const name  = [title, p.firstname_th, p.lastname_th].filter(Boolean).join(' ');
        operatorMap.set(p.id, name || null);
    });

    return operatorMap;
};

/* ─────────────────────────────────────────────────────────────────────────────
 * Row mapper
 * ───────────────────────────────────────────────────────────────────────────*/

const mapMovement = (row, operatorMap = new Map()) => ({
    id:            row.id,
    type:          row.type,
    quantity:      row.quantity,
    note:          row.note          ?? null,
    created_by:    row.created_by    ?? null,        // kept for backwards-compat
    created_by_id: row.created_by_id ?? null,
    operator_name: operatorMap.get(row.created_by_id) ?? row.created_by ?? null,
    created_at:    row.created_at,
    item: row.items
        ? {
              id:        row.items.id,
              name:      row.items.name,
              code:      row.items.code,
              image_url: row.items.image_url ?? null,
              category:  row.items.categories?.name ?? null,
              unit:      row.items.unit?.name ?? null,
          }
        : null,
});

/* ─────────────────────────────────────────────────────────────────────────────
 * Public API
 * ───────────────────────────────────────────────────────────────────────────*/

const getAllMovements = async ({
    page       = 1,
    limit      = 10,
    keyword    = '',
    type       = '',
    start_date = '',
    end_date   = '',
} = {}) => {
    const [rows, total] = await stockMovementRepo.SelectAllMovements({
        page, limit, keyword, type, start_date, end_date,
    });

    // Enrich with Thai operator names
    const operatorMap = await buildOperatorMap(rows);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
        items:     rows.map((r) => mapMovement(r, operatorMap)),
        total,
        page,
        limit,
        totalPages,
        nextPage:  page < totalPages ? page + 1 : null,
        prevPage:  page > 1         ? page - 1 : null,
    };
};

const getMovementById = async (id) => {
    const row = await stockMovementRepo.SelectMovementById(id);
    if (!row) throw new Error('Stock movement not found');

    const operatorMap = await buildOperatorMap([row]);
    return mapMovement(row, operatorMap);
};

module.exports = {
    getAllMovements,
    getMovementById,
};
