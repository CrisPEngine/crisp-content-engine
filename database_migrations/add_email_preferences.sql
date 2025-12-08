-- Migration: Add email_preferences table
-- Purpose: Allow users to opt in/out of non-essential emails
-- Date: 2024
-- Note: This is for future use, not immediately required

-- Create email_preferences table
CREATE TABLE IF NOT EXISTS email_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Email category preferences (default to true = opt-in)
    strategy_reminders BOOLEAN DEFAULT TRUE,
    content_approval_reminders BOOLEAN DEFAULT TRUE,
    oauth_reconnect_notifications BOOLEAN DEFAULT TRUE,
    system_notifications BOOLEAN DEFAULT TRUE, -- Critical system emails always sent
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_email_preferences_user_id 
    ON email_preferences(user_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_email_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_preferences_updated_at
    BEFORE UPDATE ON email_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_email_preferences_updated_at();

-- Add comment
COMMENT ON TABLE email_preferences IS 'User preferences for email notifications (non-essential emails can be opted out)';


