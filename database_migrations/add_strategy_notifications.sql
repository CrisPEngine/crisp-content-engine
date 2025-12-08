-- Migration: Add strategy_notifications table
-- Purpose: Track strategy reminder emails and user responses per billing cycle
-- Date: 2024

-- Create strategy_notifications table
CREATE TABLE IF NOT EXISTS strategy_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    brand_profile_id TEXT, -- Airtable brand profile ID
    billing_cycle_end_date DATE NOT NULL, -- End date of the billing cycle this notification is for
    reminder_sent_at TIMESTAMPTZ, -- When the reminder email was sent
    reminder_type TEXT CHECK (reminder_type IN ('first', 'final')), -- Type of reminder: 'first' (7 days before) or 'final' (2 days before)
    user_action TEXT, -- 'keep' | 'update' | 'auto_continued' | null
    user_action_at TIMESTAMPTZ, -- When user took action (or auto-continued)
    strategy_confirmed_for_next_cycle BOOLEAN DEFAULT FALSE, -- Whether strategy is confirmed for next cycle
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one notification record per user per billing cycle
    UNIQUE(user_id, billing_cycle_end_date)
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_strategy_notifications_user_cycle 
    ON strategy_notifications(user_id, billing_cycle_end_date);

CREATE INDEX IF NOT EXISTS idx_strategy_notifications_reminder_sent 
    ON strategy_notifications(reminder_sent_at) 
    WHERE reminder_sent_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_strategy_notifications_user_action 
    ON strategy_notifications(user_action) 
    WHERE user_action IS NULL;

CREATE INDEX IF NOT EXISTS idx_strategy_notifications_reminder_type 
    ON strategy_notifications(reminder_type) 
    WHERE reminder_type IS NOT NULL;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_strategy_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER strategy_notifications_updated_at
    BEFORE UPDATE ON strategy_notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_strategy_notifications_updated_at();

-- Add comments
COMMENT ON TABLE strategy_notifications IS 'Tracks strategy reminder emails and user responses per billing cycle';
COMMENT ON COLUMN strategy_notifications.reminder_type IS 'Type of reminder sent: "first" (7 days before) or "final" (2 days before)';

