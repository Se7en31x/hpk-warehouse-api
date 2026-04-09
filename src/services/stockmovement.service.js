const stockMovementRepo = require('../repositories/stockmovement.repo');

const mapMovement = (row) => ({
    id: row.id,
    type: row.type,
    quantity: row.quantity,
    note: row.note ?? null,
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    item: row.items
        ? {
              id: row.items.id,
              name: row.items.name,
              code: row.items.code,
              image_url: row.items.image_url ?? null,
              category: row.items.categories?.name ?? null,
              unit: row.items.unit?.name ?? null,
          }
        : null,
});

const getAllMovements = async ({ page = 1, limit = 10, keyword = '', type = '', start_date = '', end_date = '' } = {}) => {
    const [rows, total] = await stockMovementRepo.SelectAllMovements({
        page, limit, keyword, type, start_date, end_date,
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
        items: rows.map(mapMovement),
        total,
        page,
        limit,
        totalPages,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null,
    };
};

const getMovementById = async (id) => {
    const row = await stockMovementRepo.SelectMovementById(id);
    if (!row) throw new Error('Stock movement not found');
    return mapMovement(row);
};

module.exports = {
    getAllMovements,
    getMovementById,
};
