-- Migration: Add reminder_type to strategy_notifications table
-- Purpose: Support first and final reminder emails per billing cycle
-- Date: 2024
-- 
-- NOTE: This migration is only needed if you already have the strategy_notifications table
-- without the reminder_type column. If you're creating the table fresh, use
-- add_strategy_notifications.sql instead, which includes this column from the start.

-- Check if table exists before attempting to add column
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'strategy_notifications') THEN
        -- Add reminder_type column to track which reminder was sent
        ALTER TABLE strategy_notifications
        ADD COLUMN IF NOT EXISTS reminder_type TEXT CHECK (reminder_type IN ('first', 'final'));
    ELSE
        RAISE NOTICE 'Table strategy_notifications does not exist. Please run add_strategy_notifications.sql first.';
    END IF;
END $$;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_strategy_notifications_reminder_type 
    ON strategy_notifications(reminder_type) 
    WHERE reminder_type IS NOT NULL;

-- Add comment
COMMENT ON COLUMN strategy_notifications.reminder_type IS 'Type of reminder sent: "first" (7 days before) or "final" (2 days before)';

