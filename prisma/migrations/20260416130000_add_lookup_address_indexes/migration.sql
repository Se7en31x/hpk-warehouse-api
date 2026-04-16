-- Migration: add_lookup_address_indexes
-- Safe: index-only additions, no DROP / ALTER TABLE / data changes.
-- All tables are in the "public" schema.

-- Speeds up districts-by-province queries: WHERE provcode = ?
-- The existing (provcode, distcode) UNIQUE index already covers this,
-- but an explicit provcode-only index is faster for range scans.
CREATE INDEX IF NOT EXISTS "idx_lookup_district_provcode"
  ON public.lookup_district (provcode);

-- Speeds up subdistricts-by-district queries: WHERE provcode = ? AND distcode = ?
CREATE INDEX IF NOT EXISTS "idx_lookup_subdistrict_prov_dist"
  ON public.lookup_subdistrict (provcode, distcode);

-- Speeds up zip_code lookups/verification queries
CREATE INDEX IF NOT EXISTS "idx_lookup_subdistrict_zip"
  ON public.lookup_subdistrict (zip_code);
