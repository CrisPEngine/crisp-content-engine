# Trial Flow Documentation

## Overview

This document explains how free trials work in CRISP Content Engine, including the trial lifecycle, reminder emails, and conversion to paid subscriptions.

## Trial Lifecycle

### 1. Trial Creation

When an admin offers a free trial to an auth-only user:

1. **Profile Creation**: If the user doesn't have a profile, one is created automatically
2. **Trial Subscription**: A subscription record is created with:
   - Selected plan (Creator, Growth, Pro, or Scale)
   - Billing cycle (Monthly or Annual)
   - `current_period_end` set to trial expiration date (trial days from now)
   - **No `stripe_subscription_id`** (this indicates it's a trial, not a paid subscription)
3. **Invite Email**: User receives an email with trial details and activation link

### 2. During Trial

- User has full access to all features of their selected plan
- Content generation, scheduling, and publishing work normally
- No payment method required
- User can use the platform as if they had a paid subscription

### 3. Trial Ending Reminder (7 Days Before)

**Automated Email**: 7 days before the trial ends, users receive an email:
- **Subject**: "Your content pipeline doesn't have to stop here"
- **Content**: Explains benefits of upgrading, what they'll lose if trial ends
- **CTA**: "Upgrade your plan" button linking to `/billing?trial_ending=true`

**Cron Job**: 
- Endpoint: `/api/cron/trial-reminders`
- Schedule: Daily at 9:00 AM UTC (configured in `vercel.json`)
- Finds all subscriptions with:
  - `stripe_subscription_id` is NULL (trial subscriptions)
  - `current_period_end` is between today and 7 days from now
- Sends reminder emails to matching users

### 4. Trial End

When `current_period_end` passes:

**What Happens**:
- User's subscription remains in the database but becomes inactive
- Access to the platform is restricted (enforced by `enforceCaps` function)
- User cannot generate new content or publish
- Existing scheduled content may not publish (depending on implementation)

**User Experience**:
- User sees upgrade prompts in the dashboard
- User is redirected to billing page when trying to use features
- User can upgrade at any time to restore access

### 5. Conversion to Paid

**User Flow**:
1. User clicks "Upgrade" or visits `/billing`
2. User selects a plan (can be different from trial plan)
3. User goes through Stripe Checkout
4. After successful payment:
   - Stripe webhook (`/api/stripe/webhook`) is called
   - `checkout.session.completed` event is processed
   - Subscription is updated with:
     - `stripe_customer_id`
     - `stripe_subscription_id`
     - `current_period_end` updated to new billing period
   - User immediately regains full access

**Key Difference**:
- **Trial**: `stripe_subscription_id` is NULL
- **Paid**: `stripe_subscription_id` has a Stripe subscription ID

## Technical Implementation

### Trial Detection

The system identifies trial subscriptions by checking:
```sql
stripe_subscription_id IS NULL
AND current_period_end IS NOT NULL
```

### Access Control

The `enforceCaps` function in `src/lib/enforceCaps.ts` checks:
1. If user has an active subscription
2. If `current_period_end` is in the future
3. If subscription has a `stripe_subscription_id` (paid) OR is within trial period

### Reminder Email System

**Endpoint**: `GET /api/cron/trial-reminders`

**Security**: 
- Optional `CRON_SECRET` environment variable
- If set, requires `Authorization: Bearer <CRON_SECRET>` header
- If not set, endpoint is publicly accessible (not recommended for production)

**Vercel Cron Configuration**:
```json
{
  "crons": [
    {
      "path": "/api/cron/trial-reminders",
      "schedule": "0 9 * * *"
    }
  ]
}
```

**Manual Trigger** (for testing):
```bash
curl https://app.crispdigital.io/api/cron/trial-reminders \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Email Templates

### Trial Invite Email
- **Component**: `src/emails/auth/AuthInviteEmail.tsx`
- **Subject**: "Finish setting up. Your free trial is ready"
- **Content**: Explains trial benefits, what they get, no payment required
- **CTA**: "Start free trial"

### Trial Ending Reminder
- **Component**: `src/emails/product/TrialEndingEmail.tsx`
- **Subject**: "Your content pipeline doesn't have to stop here"
- **Content**: Benefits of upgrading, what they'll lose
- **CTA**: "Upgrade your plan"

## Environment Variables

Add to Vercel:
```
CRON_SECRET=your-secret-key-here  # Optional but recommended
```

## Monitoring

Check Vercel logs for:
- `[Trial Reminders]` - Reminder email sending
- `[Offer Trial]` - Trial creation
- Stripe webhook logs for conversions

## Future Enhancements

Potential improvements:
1. **Multiple Reminders**: Send reminders at 7 days, 3 days, and 1 day before trial ends
2. **Trial Extension**: Allow admins to extend trials
3. **Trial Analytics**: Track trial-to-paid conversion rates
4. **Grace Period**: Allow limited access for X days after trial ends before full restriction
