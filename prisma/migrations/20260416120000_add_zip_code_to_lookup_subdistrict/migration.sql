-- Migration: add_zip_code_to_lookup_subdistrict
-- Safe: single nullable column addition, no DROP / ALTER TYPE / data changes.
-- Table is in the "public" schema (not "inventory").

ALTER TABLE "public"."lookup_subdistrict"
  ADD COLUMN IF NOT EXISTS "zip_code" VARCHAR(10);
