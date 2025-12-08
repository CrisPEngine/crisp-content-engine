-- Migration: Add last_approval_email_sent_at to profiles table
-- Purpose: Track when approval reminder emails were last sent to prevent spam
-- Date: 2024

-- Add column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS last_approval_email_sent_at TIMESTAMPTZ;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_profiles_last_approval_email_sent_at 
    ON profiles(last_approval_email_sent_at) 
    WHERE last_approval_email_sent_at IS NOT NULL;

-- Add comment
COMMENT ON COLUMN profiles.last_approval_email_sent_at IS 'Timestamp of last content approval reminder email sent to this user';


