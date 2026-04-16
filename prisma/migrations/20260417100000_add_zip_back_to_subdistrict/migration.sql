-- Restore zip_code on lookup_subdistrict.
-- zip_code on lookup_district is kept for reference but is no longer served by the API.

ALTER TABLE public.lookup_subdistrict
  ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10);

-- Index for zip-based lookups (e.g. reverse geocode)
CREATE INDEX IF NOT EXISTS idx_lookup_subdistrict_zip
  ON public.lookup_subdistrict (zip_code);
