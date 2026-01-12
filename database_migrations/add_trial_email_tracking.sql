-- Migration: Add trial email tracking fields to subscriptions table
-- Purpose: Track when trial reminder and trial ended emails have been sent
-- Date: 2025
-- Note: Prevents duplicate trial reminder emails

-- Add tracking fields to subscriptions table
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS trial_reminder_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_ended_email_sent_at TIMESTAMPTZ;

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_reminder_sent 
    ON public.subscriptions(trial_reminder_sent_at) 
    WHERE trial_reminder_sent_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_ended_email_sent 
    ON public.subscriptions(trial_ended_email_sent_at) 
    WHERE trial_ended_email_sent_at IS NOT NULL;

-- Add comments
COMMENT ON COLUMN public.subscriptions.trial_reminder_sent_at IS 'Timestamp when the 5-day reminder email was sent';
COMMENT ON COLUMN public.subscriptions.trial_ended_email_sent_at IS 'Timestamp when the trial ended email was sent';

