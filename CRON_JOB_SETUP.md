# Cron-Job.org Setup Guide

This guide explains how to set up scheduled jobs using cron-job.org to trigger email reminders and other scheduled tasks.

## Prerequisites

- A cron-job.org account (free tier available)
- Your `CRON_SECRET` environment variable set in Vercel
- Your production app URL (e.g., `https://app.crispdigital.io`)

## Required Cron Jobs

### 1. Strategy Reminder (Daily)

**Purpose**: Send strategy reminder emails to users whose billing period is ending soon.

**Schedule**: Daily at 9:00 AM UTC (or your preferred time)

**Endpoint**: `POST https://app.crispdigital.io/api/email/strategy-reminder`

**Headers**:
```
X-Cron-Secret: your-cron-secret-value
Content-Type: application/json
```

**Setup Steps**:
1. Go to https://cron-job.org
2. Sign up or log in
3. Click "Create cronjob"
4. Fill in:
   - **Title**: Strategy Reminder Email
   - **Address**: `https://app.crispdigital.io/api/email/strategy-reminder`
   - **Schedule**: `0 9 * * *` (9 AM UTC daily)
   - **Request Method**: POST
   - **Request Headers**: 
     ```
     X-Cron-Secret: your-cron-secret-value
     Content-Type: application/json
     ```
   - **Notification**: Optional (email you if job fails)
5. Click "Create cronjob"

### 2. Content Approval Reminder (Every 3 Hours)

**Purpose**: Send content approval reminder emails to users with pending content.

**Schedule**: Every 3 hours

**Endpoint**: `POST https://app.crispdigital.io/api/email/content-approval-reminder`

**Headers**:
```
X-Cron-Secret: your-cron-secret-value
Content-Type: application/json
```

**Setup Steps**:
1. Go to https://cron-job.org
2. Click "Create cronjob"
3. Fill in:
   - **Title**: Content Approval Reminder
   - **Address**: `https://app.crispdigital.io/api/email/content-approval-reminder`
   - **Schedule**: `0 */3 * * *` (every 3 hours)
   - **Request Method**: POST
   - **Request Headers**: 
     ```
     X-Cron-Secret: your-cron-secret-value
     Content-Type: application/json
     ```
4. Click "Create cronjob"

### 3. Strategy Auto-Continue (Daily)

**Purpose**: Automatically continue strategies for users who haven't responded by the deadline.

**Schedule**: Daily at 10:00 AM UTC (1 hour after reminder)

**Endpoint**: `POST https://app.crispdigital.io/api/email/strategy-auto-continue`

**Headers**:
```
X-Cron-Secret: your-cron-secret-value
Content-Type: application/json
```

**Setup Steps**:
1. Go to https://cron-job.org
2. Click "Create cronjob"
3. Fill in:
   - **Title**: Strategy Auto-Continue
   - **Address**: `https://app.crispdigital.io/api/email/strategy-auto-continue`
   - **Schedule**: `0 10 * * *` (10 AM UTC daily)
   - **Request Method**: POST
   - **Request Headers**: 
     ```
     X-Cron-Secret: your-cron-secret-value
     Content-Type: application/json
     ```
4. Click "Create cronjob"

### 4. Content Auto-Publish (REMOVED)

**Note**: Content auto-publish has been disabled. Content must be explicitly approved by users via email actions. Do not set up this cron job.

## Security Notes

- **Never commit `CRON_SECRET` to git** - Keep it in environment variables only
- The `X-Cron-Secret` header must match exactly with your `CRON_SECRET` env var
- All cron endpoints verify this secret before processing
- If a request fails authentication, it returns 401 and logs a warning

## Testing Cron Jobs

### Manual Testing

You can test cron jobs manually using curl:

```bash
curl -X POST https://app.crispdigital.io/api/email/strategy-reminder \
  -H "X-Cron-Secret: your-cron-secret-value" \
  -H "Content-Type: application/json"
```

### Monitoring

- Check cron-job.org dashboard for execution history
- Check Vercel function logs for any errors
- Monitor Resend dashboard for email delivery rates

## Cron Schedule Reference

Common cron patterns:
- `0 9 * * *` - Daily at 9:00 AM UTC
- `0 */3 * * *` - Every 3 hours
- `0 * * * *` - Every hour
- `*/15 * * * *` - Every 15 minutes
- `0 0 * * 0` - Weekly on Sunday at midnight

## Troubleshooting

### Job Not Running
- Verify the cron job is enabled in cron-job.org
- Check the schedule is correct
- Verify the URL is accessible (no 404 errors)

### 401 Unauthorized
- Verify `X-Cron-Secret` header matches `CRON_SECRET` env var
- Check header is set correctly in cron-job.org

### 500 Errors
- Check Vercel function logs
- Verify all required environment variables are set
- Check database connection and table existence

## Free Tier Limitations

cron-job.org free tier:
- Up to 2 cron jobs
- Minimum interval: 1 hour
- Basic monitoring

For more frequent jobs or more cron jobs, consider:
- Upgrading to paid tier
- Using multiple free accounts
- Using Vercel Cron (Pro plan required)

