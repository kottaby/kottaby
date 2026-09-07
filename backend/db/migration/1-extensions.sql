-- Enable the pg_trgm extension for faster LIKE/ILIKE searches
-- Drizzle doesn't create extensions automatically, so we need to do it manually.
-- Guarded via pg_available_extensions: embedded PostgreSQL builds (PGlite,
-- used for local sandbox/test runs) do not ship pg_trgm — skipped there.
-- The schema creates no trigram indexes, so LIKE/ILIKE queries still work
-- without it (just unaccelerated) on embedded builds.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') THEN
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
    ELSE
        RAISE NOTICE 'pg_trgm unavailable on this PostgreSQL build — skipping (embedded/PGlite)';
    END IF;
END
$$;

-- Create helper function to check if timezone name is valid
CREATE OR REPLACE FUNCTION is_valid_timezone(tz TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF tz = 'Asia/Jerusalem' THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = tz);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

