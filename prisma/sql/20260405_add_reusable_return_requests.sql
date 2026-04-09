CREATE TABLE IF NOT EXISTS inventory.reusable_return_requests (
    id SERIAL PRIMARY KEY,
    doc_no VARCHAR(50) NOT NULL UNIQUE,
    department_id INTEGER NOT NULL,
    preferred_pickup_at TIMESTAMPTZ NULL,
    contact_name VARCHAR(255) NULL,
    contact_phone VARCHAR(50) NULL,
    note TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
    requested_by UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT fk_reusable_return_request_department
        FOREIGN KEY (department_id)
        REFERENCES public.departments(id)
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
);

CREATE INDEX IF NOT EXISTS idx_reusable_return_requests_department
    ON inventory.reusable_return_requests(department_id);

CREATE INDEX IF NOT EXISTS idx_reusable_return_requests_status
    ON inventory.reusable_return_requests(status);

CREATE TABLE IF NOT EXISTS inventory.reusable_return_request_items (
    id SERIAL PRIMARY KEY,
    request_id INTEGER NOT NULL,
    item_id UUID NOT NULL,
    requested_qty INTEGER NOT NULL,
    note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_reusable_return_request_item_request
        FOREIGN KEY (request_id)
        REFERENCES inventory.reusable_return_requests(id)
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT fk_reusable_return_request_item_item
        FOREIGN KEY (item_id)
        REFERENCES inventory.items(id)
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT ck_reusable_return_request_items_requested_qty
        CHECK (requested_qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_reusable_return_request_items_request
    ON inventory.reusable_return_request_items(request_id);

CREATE INDEX IF NOT EXISTS idx_reusable_return_request_items_item
    ON inventory.reusable_return_request_items(item_id);
