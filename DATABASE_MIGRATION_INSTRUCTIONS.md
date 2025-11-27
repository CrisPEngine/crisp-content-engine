# Database Migration: Add LinkedIn Connection Types Support

## Overview
This migration updates the `social_connections` table to support multiple LinkedIn connections per user (personal and business accounts simultaneously).

## Prerequisites
- Access to Supabase SQL Editor
- Admin access to your Supabase project

## Migration Steps

### 1. Check Current Constraints

First, identify the existing unique constraint name:

```sql
SELECT constraint_name 
FROM information_schema.table_constraints 
WHERE table_name = 'social_connections' 
  AND constraint_type = 'UNIQUE'
  AND table_schema = 'public';
```

This will show you constraint names like:
- `social_connections_user_id_provider_key`
- `social_connections_pkey` (if it's a primary key constraint)

### 2. Run Migration SQL

Execute the following SQL in Supabase SQL Editor:

```sql
-- 1) Drop existing unique constraint on (user_id, provider)
-- Replace 'social_connections_user_id_provider_key' with the actual constraint name from step 1
ALTER TABLE social_connections
  DROP CONSTRAINT IF EXISTS social_connections_user_id_provider_key;

-- 2) Add connection_type column if it does not already exist
ALTER TABLE social_connections
  ADD COLUMN IF NOT EXISTS connection_type text;

-- 3) Add organization_urn column if it does not already exist
ALTER TABLE social_connections
  ADD COLUMN IF NOT EXISTS organization_urn text;

-- 4) Add organization_name column if it does not already exist
ALTER TABLE social_connections
  ADD COLUMN IF NOT EXISTS organization_name text;

-- 5) Add brand_profile_id column if it does not already exist (for brand assignment)
ALTER TABLE social_connections
  ADD COLUMN IF NOT EXISTS brand_profile_id text;

-- 6) Backfill existing LinkedIn rows as 'member' (personal profile)
UPDATE social_connections
SET connection_type = 'member'
WHERE provider = 'linkedin' AND connection_type IS NULL;

-- 7) Add new unique index on (user_id, provider, connection_type)
-- This allows one connection per type (member or organization) per provider per user
CREATE UNIQUE INDEX IF NOT EXISTS social_connections_user_provider_type_uidx
ON social_connections (user_id, provider, connection_type)
WHERE provider = 'linkedin'; -- Partial index for LinkedIn only

-- 8) Optional: Add index for faster lookups by connection_type
CREATE INDEX IF NOT EXISTS social_connections_connection_type_idx
ON social_connections (provider, connection_type)
WHERE provider = 'linkedin';

-- 9) Optional: Add index for brand_profile_id lookups (used in publishing)
CREATE INDEX IF NOT EXISTS social_connections_brand_profile_id_idx
ON social_connections (brand_profile_id)
WHERE brand_profile_id IS NOT NULL;
```

### 3. Verify Migration

Run these queries to verify:

```sql
-- Check columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'social_connections' 
  AND column_name IN ('connection_type', 'organization_urn', 'organization_name', 'brand_profile_id');

-- Check unique index exists
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'social_connections' 
  AND indexname = 'social_connections_user_provider_type_uidx';

-- Check existing LinkedIn connections
SELECT id, user_id, provider, connection_type, organization_urn, brand_profile_id 
FROM social_connections 
WHERE provider = 'linkedin';
```

### 4. Expected Results

After migration:
- Existing LinkedIn connections will have `connection_type = 'member'`
- You can now have both `connection_type = 'member'` and `connection_type = 'organization'` for the same user
- The unique constraint allows: one member + one organization per user per provider

## Notes

- **Existing data**: All existing LinkedIn connections are automatically set to `connection_type = 'member'`
- **Backward compatibility**: The code handles both old and new schemas during transition
- **Brand assignment**: The `brand_profile_id` column links connections to brands for publishing

## Troubleshooting

If you encounter errors:

1. **Constraint name mismatch**: Use the query in step 1 to find the actual constraint name
2. **Columns already exist**: The `IF NOT EXISTS` clauses will skip creation if columns already exist
3. **Index already exists**: The `IF NOT EXISTS` clauses will skip creation if indexes already exist

## Rollback (if needed)

If you need to rollback:

```sql
-- Remove new index
DROP INDEX IF EXISTS social_connections_user_provider_type_uidx;
DROP INDEX IF EXISTS social_connections_connection_type_idx;
DROP INDEX IF EXISTS social_connections_brand_profile_id_idx;

-- Remove new columns (WARNING: This will delete data!)
-- ALTER TABLE social_connections DROP COLUMN IF EXISTS connection_type;
-- ALTER TABLE social_connections DROP COLUMN IF EXISTS organization_urn;
-- ALTER TABLE social_connections DROP COLUMN IF EXISTS organization_name;
-- ALTER TABLE social_connections DROP COLUMN IF EXISTS brand_profile_id;

-- Restore old unique constraint (replace with actual constraint definition)
-- ALTER TABLE social_connections ADD CONSTRAINT social_connections_user_id_provider_key UNIQUE (user_id, provider);
```

