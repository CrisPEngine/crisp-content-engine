# Free Cron Job Setup for LinkedIn Publishing

This guide explains how to set up free external cron jobs to enable more frequent LinkedIn publishing (every 15 minutes) without upgrading to Vercel Pro.

## Current Situation

- **Vercel Hobby Plan**: Limits cron jobs to once per day
- **Current Schedule**: Daily at 9 AM UTC
- **Desired Schedule**: Every 15 minutes (or more frequent)

## Best Free Options

### Option 1: cron-job.org (Recommended) ⭐

**Pros:**
- Free tier: 2 cron jobs
- Can run every 5 minutes (minimum interval)
- Reliable and widely used
- Easy setup
- Email notifications on failures

**Cons:**
- Minimum interval is 5 minutes (not 1 minute)
- Free tier limited to 2 cron jobs

**Setup Steps:**
1. Go to [cron-job.org](https://cron-job.org) and create a free account
2. Click "Create cronjob"
3. Configure:
   - **Title**: LinkedIn Publishing Job
   - **Address**: `https://app.crispdigital.io/api/publish/linkedin-due`
   - **Schedule**: Every 15 minutes (`*/15 * * * *`)
   - **Request Method**: GET
   - **Request Headers**: Add header:
     - Name: `X-Cron-Secret`
     - Value: `[Your secret key from .env]`
   - **Notifications**: Enable email notifications for failures
4. Save the cron job

### Option 2: EasyCron

**Pros:**
- Free tier: 1 cron job
- Can run every 1 minute
- Good reliability

**Cons:**
- Only 1 free cron job
- Less popular than cron-job.org

**Setup Steps:**
1. Go to [EasyCron.com](https://www.easycron.com) and sign up
2. Create a new cron job
3. Configure:
   - **URL**: `https://app.crispdigital.io/api/publish/linkedin-due`
   - **Schedule**: Every 15 minutes
   - **HTTP Method**: GET
   - **HTTP Headers**: Add `X-Cron-Secret: [Your secret key]`
4. Save

### Option 3: GitHub Actions (Advanced)

**Pros:**
- Free for public repos
- Can run every 5 minutes
- No external service dependency
- Version controlled

**Cons:**
- Requires GitHub repo to be public (or GitHub Pro)
- More complex setup
- Requires GitHub Actions knowledge

**Setup Steps:**
1. Create `.github/workflows/linkedin-publish.yml`:
```yaml
name: LinkedIn Publishing Cron

on:
  schedule:
    - cron: '*/15 * * * *'  # Every 15 minutes
  workflow_dispatch:  # Allow manual trigger

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Publishing
        run: |
          curl -X GET "https://app.crispdigital.io/api/publish/linkedin-due" \
            -H "X-Cron-Secret: ${{ secrets.CRON_SECRET }}"
```

2. Add `CRON_SECRET` to GitHub Secrets

## Security Setup

### Step 1: Add Authentication to Endpoint

We need to secure the endpoint so only authorized cron services can call it.

**Update `/api/publish/linkedin-due/route.ts`:**

Add this at the beginning of the handler:

```typescript
export async function GET(request: Request) {
	// Verify cron secret
	const cronSecret = request.headers.get('x-cron-secret');
	const expectedSecret = process.env.CRON_SECRET;
	
	if (!expectedSecret) {
		console.error('CRON_SECRET not configured');
		return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
	}
	
	if (cronSecret !== expectedSecret) {
		console.warn('Unauthorized cron job attempt');
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	
	// Continue with existing logic...
}
```

### Step 2: Add Environment Variable

Add to your `.env.local` and Vercel environment variables:

```bash
CRON_SECRET=your-super-secret-random-string-here
```

Generate a secure random string:
```bash
# On Mac/Linux
openssl rand -hex 32

# Or use an online generator
```

### Step 3: Update Vercel Environment Variables

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add `CRON_SECRET` with your generated secret
3. Redeploy the application

## Recommended Setup: cron-job.org

### Complete Setup Guide

1. **Generate Secret Key:**
   ```bash
   openssl rand -hex 32
   ```
   Copy the output (e.g., `a1b2c3d4e5f6...`)

2. **Add to Vercel:**
   - Vercel Dashboard → Settings → Environment Variables
   - Key: `CRON_SECRET`
   - Value: [Your generated secret]
   - Environment: Production, Preview, Development
   - Save and redeploy

3. **Create cron-job.org Account:**
   - Visit [cron-job.org](https://cron-job.org)
   - Sign up for free account
   - Verify email

4. **Create Cron Job:**
   - Click "Create cronjob"
   - **Title**: `LinkedIn Publishing`
   - **Address**: `https://app.crispdigital.io/api/publish/linkedin-due`
   - **Schedule**: 
     - Select "Every X minutes"
     - Enter `15`
     - Or use cron expression: `*/15 * * * *`
   - **Request Method**: `GET`
   - **Request Headers**: Click "Add Header"
     - Name: `X-Cron-Secret`
     - Value: `[Your secret from step 1]`
   - **Notifications**: Enable email notifications
   - Click "Create cronjob"

5. **Test the Cron Job:**
   - Click "Run now" to test
   - Check Vercel logs to verify it's working
   - Check Airtable to see if content was published

6. **Remove Vercel Cron (Optional):**
   - Once external cron is working, you can remove the Vercel cron from `vercel.json`
   - Or keep it as a backup (runs daily)

## Monitoring & Troubleshooting

### Check if Cron is Working

1. **Vercel Logs:**
   - Go to Vercel Dashboard → Your Project → Logs
   - Filter by `/api/publish/linkedin-due`
   - Look for successful requests

2. **cron-job.org Dashboard:**
   - View execution history
   - Check for failures
   - Review response codes

3. **Airtable:**
   - Check `ContentQueue` table
   - Look for records with `status = "Published"`
   - Check `published_at` timestamps

### Common Issues

**Issue: 401 Unauthorized**
- Check that `CRON_SECRET` is set in Vercel
- Verify the header name is exactly `X-Cron-Secret`
- Ensure the secret matches in both places

**Issue: Cron not running**
- Check cron-job.org execution history
- Verify the schedule is correct
- Check if cron job is enabled (not paused)

**Issue: Content not publishing**
- Check Vercel function logs for errors
- Verify LinkedIn OAuth tokens are valid
- Check Airtable for `publish_error` field

## Cost Comparison

| Solution | Cost | Frequency | Reliability |
|----------|------|-----------|-------------|
| Vercel Hobby | Free | Once/day | High |
| Vercel Pro | $20/mo | Every 15 min | High |
| cron-job.org | Free | Every 5 min | High |
| EasyCron | Free | Every 1 min | High |
| GitHub Actions | Free | Every 5 min | High |

## Recommendation

**Use cron-job.org** because:
- ✅ Free
- ✅ Reliable
- ✅ Easy setup
- ✅ Good monitoring
- ✅ Email notifications
- ✅ 5-minute minimum is acceptable (we can do every 15 minutes)

## Next Steps

1. ✅ Add authentication to the endpoint (code change)
2. ✅ Add `CRON_SECRET` to Vercel environment variables
3. ✅ Set up cron-job.org account and cron job
4. ✅ Test the cron job
5. ✅ Monitor for 24 hours to ensure reliability
6. ✅ Optionally remove Vercel cron from `vercel.json`

