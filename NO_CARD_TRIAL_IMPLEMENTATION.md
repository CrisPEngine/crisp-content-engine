# No-Credit-Card Trial Implementation

**Date:** February 3, 2026  
**Status:** ✅ Complete and ready for deployment

## Overview

Implemented a 7-day no-credit-card trial that activates after email verification, with limited generation quotas, to drive upgrades to paid plans (Starter/Creator).

## Key Changes

### 1. Database Schema (Migration `011_no_card_trial.sql`)

Added trial tracking to existing tables:

#### `public.subscriptions`
- `trial_start_at timestamptz null` - When trial started (after email verification)
- `trial_end_at timestamptz null` - When trial expires (7 days after start)
- Index on `trial_end_at` for efficient expiry queries

#### `public.trial_usage` (new table)
- `user_id uuid primary key` - References auth.users
- `linkedin_generated int default 0` - LinkedIn posts used in trial
- `x_generated int default 0` - X posts used in trial
- `created_at`, `updated_at` - Timestamps
- RLS enabled for user-scoped access
- Check constraints for non-negative values

**Rationale:** Trial quotas are lifetime (not monthly) to prevent reset on month boundaries.

### 2. Plan Configuration Updates

#### `src/config/pricing.ts`
- Added `'trial'` to `PlanId` type
- Added trial plan to `CAPS`:
  - 1 brand
  - LinkedIn + X platforms only
  - 3 LinkedIn posts, 3 X posts (lifetime)
  - No autopublish
  - Export-only

#### `src/lib/billing.ts`
- Updated `capsFor()` to accept `'trial'`
- Updated `upsertSubscriptionAndEntitlements()` to accept trial plan and `trialStartAt`/`trialEndAt` parameters

### 3. Plan Resolution & Provisioning (`src/lib/planResolver.ts`)

New canonical plan resolver with priority:
1. **Stripe subscription** (if `stripe_subscription_id` exists) → paid plan
2. **Active trial** (if verified and `now < trial_end_at`) → `'trial'`
3. **Free** (no entitlements)

**Auto-provisioning:** When a verified user has no trial and no Stripe sub:
- Creates `profiles` row (if missing)
- Creates trial `subscriptions` row with 7-day window
- Creates `trial_usage` row (0 credits used)
- Creates `entitlements` with trial caps

**Functions:**
- `resolvePlan(userId)` - Returns `ResolvedPlan` with plan, cycle, trial info
- `getTrialUsage(userId)` - Fetches trial usage
- `incrementTrialUsage(userId, { linkedin, x })` - Increments trial usage

### 4. API Updates

#### `/api/plan` (`src/app/api/plan/route.ts`)
- Uses `resolvePlan()` for plan resolution
- Returns trial info: `isTrial`, `trialDaysRemaining`, `trialEndAt`, `isEmailVerified`

#### `/api/usage/summary` (`src/app/api/usage/summary/route.ts`)
- Uses `resolvePlan()` for plan resolution
- Returns trial usage with remaining credits if on trial

#### `/api/content/generate` (`src/app/api/content/generate/route.ts`)
**New enforcement:**
- ✅ **Email verification gate**: Returns `403` with `email_verification_required: true` if not verified
- ✅ **Trial quota gate**: Checks `trial_usage` and blocks if LinkedIn/X limits reached
- ✅ **Rate limiting** (trial only): Max 2 generation requests per 60 seconds
- Returns `upgrade_required: true` when quotas exhausted

#### `/api/content/generation/complete` (`src/app/api/content/generation/complete/route.ts`)
- Passes `channelCounts` to `/api/usage/increment` for per-channel tracking
- Calls `incrementTrialUsage()` when user is on trial

#### `/api/checkout` (`src/app/api/checkout/route.ts`)
- **Removed** 14-day Stripe trial for Creator plan
- Now uses no-card trial exclusively

### 5. UI Components

#### `src/components/TrialBanner.tsx` (new)
Client component displaying:
- Trial active status
- Days remaining
- Remaining credits (LinkedIn & X)
- Upgrade button → `/billing`

Added to:
- `/dashboard` page
- `/content/generate` page

#### `src/components/UpgradeModal.tsx` (new)
Modal displayed when trial limits reached:
- Shows reason (from API error)
- Starter & Creator plan cards with features
- CTA buttons → Stripe checkout
- Link to `/billing` for all plans

Integrated into `/content/generate` page to handle `upgrade_required` errors.

#### `src/app/(site)/billing/page.tsx`
- **Removed** 14-day trial messaging for Creator plan
- Kept "Export-only" badge for Starter plan
- Updated to handle trial plan resolution

#### `src/app/(app)/admin/page.tsx`
- Fixed TypeScript errors by filtering out `'trial'` from PRICING dropdown (trial is not purchasable)

### 6. Type Safety Fixes

Fixed TypeScript errors where `PlanId` now includes `'trial'` but `PRICING` config doesn't:
- Admin page: Filter `PRICING.order` to exclude `'trial'`
- Billing page: Added guard in `getPlanDetails()` for trial

## User Flow

### New User Journey
1. User signs up → receives email verification link
2. User verifies email → **trial auto-provisions** (7 days, 3 LinkedIn, 3 X)
3. User sees **trial banner** on dashboard with countdown & remaining credits
4. User generates content (max 2 requests/min)
5. When quotas reached or trial expires → **upgrade modal** appears
6. User upgrades to Starter ($5) or Creator ($9) via Stripe Checkout

### Existing Paid Users
- No change - continue using paid plan
- Trial logic only applies to users without Stripe subscription

## Deployment Checklist

### 1. Supabase Migration
```bash
# Run migration 011_no_card_trial.sql
supabase migration up
```

### 2. Environment Variables
No new env vars required (existing Stripe price IDs used).

### 3. Deploy to Vercel
```bash
git add .
git commit -m "Implement no-credit-card trial plan"
git push origin main
```

### 4. Post-Deployment Verification

**Test Trial Flow:**
- [ ] New user signup → verify email → trial activates
- [ ] Trial banner shows on dashboard
- [ ] Generate 3 LinkedIn posts → blocked on 4th
- [ ] Generate 3 X posts → blocked on 4th
- [ ] Rate limit: 2 requests/min enforced
- [ ] Upgrade modal appears when quota reached
- [ ] Upgrade to Starter/Creator works

**Test Existing Users:**
- [ ] Paid users (Starter/Creator) see no trial banner
- [ ] Admin users unaffected
- [ ] Free users (no trial yet) provision trial on email verify

**Stripe:**
- [ ] Creator checkout has NO trial period (14-day removed)
- [ ] Starter checkout works
- [ ] Webhook provisions subscription correctly

## Database Queries for Monitoring

```sql
-- Check trial users
SELECT 
  s.user_id,
  p.email,
  s.trial_start_at,
  s.trial_end_at,
  tu.linkedin_generated,
  tu.x_generated
FROM subscriptions s
JOIN profiles p ON s.user_id = p.id
LEFT JOIN trial_usage tu ON s.user_id = tu.user_id
WHERE s.trial_end_at IS NOT NULL
  AND s.stripe_subscription_id IS NULL
ORDER BY s.trial_start_at DESC;

-- Check expired trials
SELECT 
  s.user_id,
  p.email,
  s.trial_end_at,
  tu.linkedin_generated,
  tu.x_generated
FROM subscriptions s
JOIN profiles p ON s.user_id = p.id
LEFT JOIN trial_usage tu ON s.user_id = tu.user_id
WHERE s.trial_end_at < NOW()
  AND s.stripe_subscription_id IS NULL;

-- Check trial conversion rate
SELECT 
  COUNT(*) FILTER (WHERE stripe_subscription_id IS NULL AND trial_end_at IS NOT NULL) as trial_users,
  COUNT(*) FILTER (WHERE stripe_subscription_id IS NOT NULL AND trial_end_at IS NOT NULL) as converted_users
FROM subscriptions;
```

## Anti-Abuse Measures

1. **Email verification required** before trial starts
2. **Rate limiting** (2 requests/min) for trial users
3. **Lifetime quotas** (not monthly) prevent reset exploits
4. **No trial for existing paid users** (Stripe takes precedence)

Future enhancements (not implemented):
- Block multiple trials per email domain pattern
- IP-based throttling
- Device fingerprinting

## Rollback Plan

If issues arise:

1. **Disable trial provisioning:**
   ```typescript
   // In src/lib/planResolver.ts
   // Comment out provisionTrial() call
   ```

2. **Revert migration:**
   ```bash
   supabase migration down 011_no_card_trial.sql
   ```

3. **Re-enable Stripe trial** (if needed):
   ```typescript
   // In src/app/api/checkout/route.ts
   sessionConfig.subscription_data.trial_period_days = 14;
   ```

## Notes

- All todos completed ✅
- Build passes ✅
- No breaking changes to existing features
- Trial logic is isolated and can be disabled without affecting paid users
- Plan resolution is centralized in `planResolver.ts` for consistency

## Support

For questions or issues:
- Check logs in Vercel Functions
- Monitor trial usage in Supabase
- Review Stripe webhook logs for upgrade flows
