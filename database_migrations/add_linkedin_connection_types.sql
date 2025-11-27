-- Migration: Add connection_type support for multiple LinkedIn connections
-- This allows users to have both personal and business LinkedIn connections simultaneously

-- 1) Drop existing unique constraint on (user_id, provider)
-- The actual constraint name may differ. Check Supabase first with:
-- SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'social_connections' AND constraint_type = 'UNIQUE';
ALTER TABLE social_connections
  DROP CONSTRAINT IF EXISTS social_connections_user_id_provider_key;

-- 2) Add connection_type column if it does not already exist
ALTER TABLE social_connections
  ADD COLUMN IF NOT EXISTS connection_type text;

-- 3) Add organization_urn column if it does not already exist (standardize naming)
ALTER TABLE social_connections
  ADD COLUMN IF NOT EXISTS organization_urn text;

-- 4) Add organization_name column if it does not already exist
ALTER TABLE social_connections
  ADD COLUMN IF NOT EXISTS organization_name text;

-- 5) Backfill existing LinkedIn rows as 'member' (personal profile)
UPDATE social_connections
SET connection_type = 'member'
WHERE provider = 'linkedin' AND connection_type IS NULL;

-- 6) Make connection_type NOT NULL for LinkedIn rows (optional, but recommended)
-- Uncomment if you want to enforce this constraint:
-- ALTER TABLE social_connections
--   ALTER COLUMN connection_type SET NOT NULL;

-- 7) Add new unique index on (user_id, provider, connection_type)
-- This allows one connection per type (member or organization) per provider per user
CREATE UNIQUE INDEX IF NOT EXISTS social_connections_user_provider_type_uidx
ON social_connections (user_id, provider, connection_type)
WHERE provider = 'linkedin'; -- Partial index for LinkedIn only

-- 8) Optional: Add index for faster lookups by connection_type
CREATE INDEX IF NOT EXISTS social_connections_connection_type_idx
ON social_connections (provider, connection_type)
WHERE provider = 'linkedin';

