-- ลบตารางที่ซ้ำใน schema public ที่เกี่ยวกับคลังสินค้า
DROP TABLE IF EXISTS public.stock_movement CASCADE;
DROP TABLE IF EXISTS public.public_items CASCADE;
DROP TABLE IF EXISTS public.warehouse CASCADE;
DROP TABLE IF EXISTS public.unit CASCADE;
DROP TABLE IF EXISTS public.item_lot CASCADE;
-- หมายเหตุ: ตรวจสอบ dependencies ก่อนรันจริง
-- หากมีตารางอื่นที่ซ้ำใน public เพิ่มเติม สามารถเพิ่ม DROP TABLE ได้ตามต้องการ
