# Cron-job.org Setup for Trial Reminders

Since Vercel Cron Jobs require a Pro plan, we'll use [cron-job.org](https://cron-job.org) (free tier available) to trigger the trial reminder endpoint.

## Setup Instructions

### 1. Create Account
1. Go to https://cron-job.org
2. Sign up for a free account (or use existing account)
3. Free tier allows up to 2 cron jobs

### 2. Create Cron Job

**Job Details:**
- **Title**: CRISP Content Engine - Trial Reminders
- **Address (URL)**: `https://app.crispdigital.io/api/cron/trial-reminders?secret=YOUR_CRON_SECRET`
- **Schedule**: Daily at 9:00 AM UTC
- **Request Method**: GET

### 3. Schedule Configuration

**Cron Expression**: `0 9 * * *`
- Runs daily at 9:00 AM UTC
- This checks for trials ending in 7 days and sends reminder emails

**Alternative Schedules:**
- `0 9 * * 1` - Every Monday at 9 AM UTC
- `0 */6 * * *` - Every 6 hours
- `0 9,15 * * *` - Twice daily at 9 AM and 3 PM UTC

### 4. Security Configuration

**Option 1: Secret in URL (Recommended)**
- Add `?secret=YOUR_CRON_SECRET` to the URL
- Set `CRON_SECRET` environment variable in Vercel
- Example: `https://app.crispdigital.io/api/cron/trial-reminders?secret=abc123xyz`

**Option 2: Custom Header**
- In cron-job.org, go to "Advanced Settings"
- Add custom header:
  - **Header Name**: `x-cron-secret`
  - **Header Value**: `YOUR_CRON_SECRET`
- Set `CRON_SECRET` environment variable in Vercel

### 5. Environment Variable

Add to Vercel Dashboard → Settings → Environment Variables:

```
CRON_SECRET=your-random-secret-key-here
```

**Generate a secure secret:**
```bash
openssl rand -hex 32
```

### 6. Test the Endpoint

**Manual Test (with secret):**
```bash
curl "https://app.crispdigital.io/api/cron/trial-reminders?secret=YOUR_CRON_SECRET"
```

**Expected Response:**
```json
{
  "message": "Processed X trials ending in 7 days",
  "sent": X,
  "failed": 0,
  "results": [...]
}
```

**Manual Test (without secret - if CRON_SECRET not set):**
```bash
curl "https://app.crispdigital.io/api/cron/trial-reminders"
```

### 7. Monitoring

**Check Logs:**
- Vercel Dashboard → Your Project → Logs
- Look for `[Trial Reminders]` entries
- Check for successful email sends

**cron-job.org Dashboard:**
- View execution history
- See success/failure status
- Check last execution time

### 8. Troubleshooting

**If emails aren't sending:**
1. Check Vercel logs for errors
2. Verify `CRON_SECRET` matches in both places
3. Check that cron job is actually running (cron-job.org dashboard)
4. Verify subscriptions exist with `stripe_subscription_id IS NULL`
5. Check that `current_period_end` is within 7 days

**If getting 401 Unauthorized:**
- Verify `CRON_SECRET` environment variable is set in Vercel
- Check that the secret in the URL/header matches exactly
- Ensure no extra spaces or characters

**If cron job isn't running:**
- Check cron-job.org account status (free tier limits)
- Verify cron expression is correct
- Check cron-job.org execution logs

## Alternative: Multiple Reminder Emails

If you want to send reminders at different intervals (e.g., 7 days, 3 days, 1 day), create multiple cron jobs:

1. **7 Days Before**: `0 9 * * *` (daily, checks for 7-day window)
2. **3 Days Before**: `0 9 * * *` (daily, checks for 3-day window)  
3. **1 Day Before**: `0 9 * * *` (daily, checks for 1-day window)

Or modify the endpoint to accept a `days` parameter:
- `https://app.crispdigital.io/api/cron/trial-reminders?secret=XXX&days=7`
- `https://app.crispdigital.io/api/cron/trial-reminders?secret=XXX&days=3`
- `https://app.crispdigital.io/api/cron/trial-reminders?secret=XXX&days=1`

## Free Tier Limitations

cron-job.org free tier:
- ✅ 2 cron jobs
- ✅ Unlimited executions
- ✅ Email notifications on failure
- ❌ No custom headers (use URL parameter instead)
- ❌ Limited execution history

## Upgrade Path

If you need more features:
- **Pro Plan**: $3/month - 10 cron jobs, custom headers, longer history
- **Vercel Pro**: $20/month - Includes cron jobs, better integration
