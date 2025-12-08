# Email Implementation Summary

This document summarizes the Resend and React Email implementation for CRISP Content Engine.

## ✅ Completed Implementation

### 1. Infrastructure
- ✅ Installed `resend`, `@react-email/components`, and `react-email`
- ✅ Created Resend client wrapper (`src/lib/email/resendClient.ts`)
- ✅ Created centralized email sender (`src/lib/email/sendEmail.ts`)
- ✅ Created token signing utility for email actions (`src/lib/email/tokenSigning.ts`)

### 2. React Email Base Components
- ✅ `Layout.tsx` - Dark theme email layout (#0E0F11 background, #121417 card)
- ✅ `Header.tsx` - Logo and header section
- ✅ `Footer.tsx` - Copyright and footer text
- ✅ `Button.tsx` - Primary and secondary button styles
- ✅ `Card.tsx` - Optional card component for content sections

### 3. Auth Email Templates
- ✅ `AuthPasswordResetEmail.tsx` - Password reset emails
- ✅ `AuthInviteEmail.tsx` - Admin-created user invites
- ✅ `AuthMagicLinkEmail.tsx` - Magic link sign-in (if needed)

### 4. Product Email Templates
- ✅ `StrategyReminderEmail.tsx` - Monthly strategy confirmation reminders
- ✅ `ContentApprovalDigestEmail.tsx` - Content approval notifications
- ✅ `OAuthReconnectEmail.tsx` - OAuth connection failure notifications

### 5. Email Action Endpoints
- ✅ `/api/email-actions/strategy/keep` - One-click strategy continuation
- ✅ `/api/email-actions/content/approve` - One-click content approval
- ✅ `/email-action/complete` - Success/error page for email actions

### 6. Auth Flow Updates
- ✅ `/api/auth/password/reset` - Password reset endpoint using Resend
- ✅ Updated `/api/admin/users/create` to use Resend for invite emails

### 7. Cron Jobs
- ✅ `/api/email/strategy-reminder` - Daily strategy reminder job
- ✅ `/api/email/content-approval-reminder` - Content approval reminder job (every 2-3 hours)

### 8. OAuth Error Handling
- ✅ Added `markConnectionNeedsReauthAndNotify()` function to publishing job
- ✅ Sends OAuth reconnect emails when connections fail
- ✅ Clears `needs_reauth` flag when users reconnect
- ✅ 24-hour cooldown on reconnect emails to prevent spam

## 📋 Required Environment Variables

Add these to your `.env.local` and Vercel environment variables:

```bash
# Resend Configuration
RESEND_API_KEY=re_xxxxxxxxxxxxx  # Get from https://resend.com/api-keys
EMAIL_FROM=crisp@crispdigital.io  # Your verified domain email
EMAIL_FROM_NAME=CRISP Content Engine
EMAIL_REPLY_TO=support@crispdigital.io  # Optional

# Email Action Token Signing
EMAIL_ACTION_SECRET=your-secret-key-here  # Optional, falls back to SUPABASE_SERVICE_ROLE_KEY

# Existing (should already be set)
CRON_SECRET=your-cron-secret  # For securing cron job endpoints
```

## 🗄️ Database Schema Updates Needed

The following columns need to be added to the `social_connections` table:

```sql
ALTER TABLE social_connections
ADD COLUMN IF NOT EXISTS needs_reauth BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS oauth_reconnect_email_sent_at TIMESTAMPTZ;
```

## 🔧 Setup Steps

### 1. Resend Account Setup
1. Sign up at https://resend.com
2. Verify your domain (e.g., `crispdigital.io`)
3. Get your API key from the dashboard
4. Add `RESEND_API_KEY` to environment variables

### 2. Configure Cron Jobs

#### Option A: Vercel Cron (Recommended for Pro plan)
Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/email/strategy-reminder",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/email/content-approval-reminder",
      "schedule": "0 */3 * * *"
    }
  ]
}
```

#### Option B: External Cron Service
Use cron-job.org or EasyCron to call:
- `https://app.crispdigital.io/api/email/strategy-reminder` (daily at 9 AM)
- `https://app.crispdigital.io/api/email/content-approval-reminder` (every 3 hours)

Both endpoints require `X-Cron-Secret` header matching `CRON_SECRET`.

### 3. Update Login Flow (Optional)
If you want to use the new password reset endpoint from the frontend:

```typescript
// In your login component
const handlePasswordReset = async (email: string) => {
  const res = await fetch('/api/auth/password/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  // Handle response
};
```

## 📝 TODO Items (Future Enhancements)

1. **Database Tracking**
   - Add `strategy_reminder_sent_for_period` tracking table
   - Add `last_approval_email_sent_at` to user profiles or separate table
   - Track `auto_publish_deadline` for content items

2. **Strategy Reminder Logic**
   - Implement actual strategy continuation logic in `/api/email-actions/strategy/keep`
   - Add auto-continue logic when deadline passes
   - Store strategy confirmation status

3. **Content Auto-Publish**
   - Implement auto-publish logic when `auto_publish_deadline` is reached
   - Send summary email after auto-publishing

4. **Email Preferences**
   - Add user email preferences (opt-in/opt-out)
   - Respect user preferences in all email sends

5. **Testing**
   - Test all email templates in Resend preview
   - Test email action endpoints with valid/invalid tokens
   - Test cron jobs manually before scheduling

## 🎨 Email Design

All emails use the CRISP dark theme:
- Background: `#0E0F11`
- Card: `#121417` with `#1F2937` border
- Primary button: `#39FF14` (green) on black text
- Typography: Inter font family
- Logo: Cloudinary-hosted CRISP logo

## 🔒 Security

- Email action tokens are HMAC-signed with expiration (24 hours)
- Tokens include userId, action, and resourceId for validation
- All email action endpoints verify token signature and expiration
- Cron jobs require `X-Cron-Secret` header matching `CRON_SECRET`

## 📧 Email Categories

Emails are tagged with categories for analytics:
- `auth` - Authentication emails (password reset, invites)
- `strategy` - Strategy-related emails
- `content` - Content approval and publishing emails
- `system` - System notifications (OAuth errors, etc.)

## 🚀 Next Steps

1. Set up Resend account and verify domain
2. Add environment variables
3. Run database migration for `needs_reauth` columns
4. Configure cron jobs (Vercel or external)
5. Test email sending with a test user
6. Monitor Resend dashboard for delivery rates

## 📚 Documentation References

- [Resend Documentation](https://resend.com/docs)
- [React Email Documentation](https://react.email)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)


