# Database Migration Order

## Required Migrations

Run these migrations in Supabase SQL Editor **in this order**:

### 1. Strategy Notifications Table
**File**: `database_migrations/add_strategy_notifications.sql`

This creates the `strategy_notifications` table with all required columns including `reminder_type`.

### 2. Strategy Reminder Type (Optional - only if table already existed)
**File**: `database_migrations/add_strategy_reminder_type.sql`

This migration adds the `reminder_type` column if the table already existed without it. 
**If you ran migration #1 above, you can skip this one** since the column is already included.

### 3. Content Approval Tracking
**File**: `database_migrations/add_content_approval_tracking.sql`

Adds `last_approval_email_sent_at` to the `profiles` table.

### 4. Email Preferences (Optional - for future use)
**File**: `database_migrations/add_email_preferences.sql`

Creates the email preferences table (not immediately required).

## Quick Start

If you're setting up fresh, just run:

1. `database_migrations/add_strategy_notifications.sql` ✅
2. `database_migrations/add_content_approval_tracking.sql` ✅

That's it! The strategy notifications table now includes `reminder_type` from the start.


