# Migration Fix Instructions

## The Problem

You tried to run `add_strategy_reminder_type.sql` but got an error because the `strategy_notifications` table doesn't exist yet.

## The Solution

**You need to create the table first**, then you can add columns to it.

## Step-by-Step

### Option 1: Create Fresh (Recommended)

If you don't have the `strategy_notifications` table yet, run:

**1. Run the base migration:**
```
database_migrations/add_strategy_notifications.sql
```

This creates the table with ALL columns including `reminder_type`. You're done!

### Option 2: Table Already Exists

If the table already exists but doesn't have `reminder_type`, run:

**1. First, check if table exists:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'strategy_notifications';
```

**2. If table exists, run:**
```
database_migrations/add_strategy_reminder_type.sql
```

## What I Fixed

I've updated `add_strategy_notifications.sql` to include the `reminder_type` column from the start, so you only need one migration file if you're creating fresh.

The `add_strategy_reminder_type.sql` file is now safe to run even if the table doesn't exist (it will give you a helpful message).

## Quick Fix

Just run this file first:
- ✅ `database_migrations/add_strategy_notifications.sql`

Then you're all set! The table will be created with `reminder_type` included.


