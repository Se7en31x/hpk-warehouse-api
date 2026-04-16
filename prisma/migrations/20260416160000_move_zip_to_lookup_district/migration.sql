-- Move zip_code from lookup_subdistrict → lookup_district.
-- Districts are the natural unit for Thai postal codes; a single district
-- has one primary zip, whereas subdistricts within the same district share it.

-- 1. Add zip_code to lookup_district
ALTER TABLE public.lookup_district
  ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10);

-- 2. Remove the subdistrict-level zip index (no longer needed)
DROP INDEX IF EXISTS public.idx_lookup_subdistrict_zip;

-- 3. Remove zip_code from lookup_subdistrict
ALTER TABLE public.lookup_subdistrict
  DROP COLUMN IF EXISTS zip_code;
