# Trial Email Fix - Prevent Duplicate Emails

## Issue
Users were receiving the "free trial is coming to an end" email every day, instead of just once 5 days before the trial ends.

## Solution
Updated the trial reminder system to:
1. Send the "5 days before" reminder email **only once** (within a 24-hour window)
2. Send a "trial ended" email **only once** when the trial expires (within 24 hours of expiration)
3. Track when emails have been sent using database fields to prevent duplicates

## Changes Made

### 1. Database Migration
**File**: `database_migrations/add_trial_email_tracking.sql`

Added two tracking fields to the `subscriptions` table:
- `trial_reminder_sent_at` - Timestamp when the 5-day reminder email was sent
- `trial_ended_email_sent_at` - Timestamp when the trial ended email was sent

### 2. Updated Route Logic
**File**: `src/app/api/cron/trial-reminders/route.ts`

**Before**: Sent emails to all trials ending within X days (default 7), causing duplicates every day

**After**: 
- **5-day reminder**: Finds trials where `current_period_end` is within 24 hours of exactly 5 days from now, AND `trial_reminder_sent_at IS NULL`
- **Trial ended**: Finds trials where `current_period_end` is in the past but less than 24 hours ago, AND `trial_ended_email_sent_at IS NULL`
- Updates the tracking fields after sending emails to prevent duplicates

### 3. Updated Email Template
**File**: `src/emails/product/TrialEndingEmail.tsx`

Added `isTrialEnded` prop to support both scenarios:
- **Trial ending soon** (`isTrialEnded: false`): "Your free trial is almost over."
- **Trial ended** (`isTrialEnded: true`): "Your free trial has ended."

## How to Apply

### Step 1: Run Database Migration
1. Open Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `database_migrations/add_trial_email_tracking.sql`
3. Click "Run" to execute
4. Verify fields were added: Database → Tables → subscriptions → Columns

### Step 2: Deploy Code Changes
The code changes are ready to deploy. The migration must be run first.

### Step 3: Verify
After deployment, the cron job will:
- Send "5 days before" emails only once per trial
- Send "trial ended" emails only once per trial
- Track sent emails in the database

## Testing

To test locally:
1. Create a test trial subscription with `current_period_end` set to 5 days from now
2. Call the endpoint: `GET /api/cron/trial-reminders?secret=YOUR_SECRET`
3. Verify email is sent and `trial_reminder_sent_at` is set
4. Call the endpoint again - no email should be sent
5. Set `current_period_end` to yesterday
6. Call the endpoint - "trial ended" email should be sent once

## Notes

- The 24-hour window for "5 days before" ensures the email is sent even if cron timing varies slightly
- The tracking fields prevent duplicates even if the cron runs multiple times
- Existing trials that already received reminder emails will have `trial_reminder_sent_at = NULL`, so they may receive one more email on the next run. This is expected and will only happen once.

