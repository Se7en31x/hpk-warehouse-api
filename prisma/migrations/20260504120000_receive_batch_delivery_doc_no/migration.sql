-- เลขที่ใบส่งสินค้า / เอกสารนำส่ง (จัดซื้อ)
ALTER TABLE inventory.receive_batch
  ADD COLUMN IF NOT EXISTS delivery_doc_no VARCHAR(255);
