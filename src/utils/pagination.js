const formatPagination = (items, total, page, limit) => ({
    items,
    pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
    }
});