# Stripe 14-Day Free Trial Setup for Creator Plan

This document explains how to set up a 14-day free trial for the Creator plan in Stripe.

## Overview

The 14-day free trial is implemented at the **checkout session level** using Stripe's `subscription_data.trial_period_days` parameter. This approach is preferred because:

1. ✅ **No Stripe Dashboard changes needed** - The trial is applied programmatically
2. ✅ **Works with existing prices** - No need to create new prices or products
3. ✅ **Easy to modify** - Can change trial period in code without touching Stripe
4. ✅ **Automatic handling** - Stripe automatically manages trial periods, billing dates, and cancellations

## How It Works

1. User clicks "Choose Creator" on the billing page
2. Checkout API detects Creator plan (monthly or annual)
3. Adds `trial_period_days: 14` to the checkout session
4. User enters credit card in Stripe Checkout
5. Subscription is created with a 14-day trial
6. User is redirected back to dashboard
7. Webhook receives `checkout.session.completed` event
8. Subscription is saved with `current_period_end` set to 14 days from now
9. After 14 days, Stripe automatically charges the card and continues billing

## Stripe Dashboard Configuration

### ✅ No Changes Required!

The trial is handled entirely in code. However, you should verify:

1. **Creator Plan Prices Exist**
   - Monthly: `NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY`
   - Annual: `NEXT_PUBLIC_STRIPE_PRICE_CREATOR_ANNUAL`
   - These should already be configured in your environment variables

2. **Webhook Events**
   - Ensure your webhook at `/api/stripe/webhook` is listening for:
     - `checkout.session.completed` ✅ (already configured)
     - `customer.subscription.updated` ✅ (already configured)
     - `invoice.paid` ✅ (already configured)

3. **Test Mode**
   - Test the flow in Stripe Test Mode first
   - Use test card: `4242 4242 4242 4242`
   - Any future expiry date and CVC

## Testing the Trial

### 1. Test Checkout Flow

1. Go to `/billing` page
2. Click "Choose Creator" (monthly or annual)
3. You should be redirected to Stripe Checkout
4. **Important**: The checkout page should show "14-day free trial" or similar messaging
5. Enter test card: `4242 4242 4242 4242`
6. Complete checkout
7. You should be redirected to `/dashboard?sub=success`

### 2. Verify Trial in Stripe Dashboard

1. Go to Stripe Dashboard → Customers
2. Find the test customer
3. Click on their subscription
4. Verify:
   - **Status**: `trialing` (not `active`)
   - **Trial end date**: Should be 14 days from now
   - **Current period end**: Should match trial end date

### 3. Verify Trial in Database

1. Check `subscriptions` table in Supabase
2. Find the user's subscription record
3. Verify:
   - `plan`: `creator`
   - `cycle`: `monthly` or `annual`
   - `current_period_end`: Should be ~14 days from now (Unix timestamp)
   - `stripe_subscription_id`: Should match Stripe subscription ID

### 4. Test Trial Expiration (Optional)

To test what happens when the trial ends:

1. In Stripe Dashboard → Subscriptions
2. Find the test subscription
3. Click "..." → "End trial"
4. This will immediately end the trial and charge the card
5. Verify webhook receives `invoice.paid` event
6. Verify subscription status updates to `active`

## What Happens During Trial

### User Experience

1. **During Trial (Days 1-14)**:
   - User has full access to Creator plan features
   - No charge to their card
   - Can cancel anytime (cancellation takes effect at trial end)
   - Can use all Creator plan features

2. **Trial End (Day 14)**:
   - Stripe automatically charges the card
   - Subscription status changes from `trialing` to `active`
   - Webhook receives `invoice.paid` event
   - Billing cycle continues normally

3. **If User Cancels During Trial**:
   - User can cancel via billing portal
   - Subscription remains active until trial end
   - No charge is made
   - Access continues until trial end date

## Code Changes Made

### 1. Checkout API (`src/app/api/checkout/route.ts`)
- Added detection for Creator plan prices
- Adds `trial_period_days: 14` to checkout session for Creator plan only

### 2. Billing Page (`src/app/(site)/billing/page.tsx`)
- Added trial messaging badge on Creator plan card
- Added footnote about trial for free users

### 3. Webhook (`src/app/api/stripe/webhook/route.ts`)
- ✅ Already handles trial subscriptions correctly
- Uses `current_period_end` from Stripe subscription
- No changes needed

## Environment Variables

Ensure these are set in Vercel:

```
NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY=price_xxxxx
NEXT_PUBLIC_STRIPE_PRICE_CREATOR_ANNUAL=price_xxxxx
```

## Troubleshooting

### Trial Not Showing in Stripe Checkout

- **Check**: Verify price IDs match environment variables
- **Check**: Look for console logs: `[Checkout] Adding 14-day trial for Creator plan`
- **Fix**: Ensure `NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY` and `NEXT_PUBLIC_STRIPE_PRICE_CREATOR_ANNUAL` are set correctly

### Subscription Not Created After Checkout

- **Check**: Webhook logs in Vercel
- **Check**: Stripe Dashboard → Webhooks → Recent events
- **Fix**: Ensure webhook endpoint is correct and secret matches

### Trial Period Not Applied

- **Check**: Stripe Dashboard → Subscriptions → Check trial end date
- **Check**: Code logs for `trial_period_days` being added
- **Fix**: Verify price ID comparison logic in checkout route

### User Charged Immediately

- **Check**: Stripe subscription status (should be `trialing`, not `active`)
- **Check**: Trial end date in Stripe Dashboard
- **Fix**: If charged immediately, the trial wasn't applied - check checkout session creation

## Stripe Test Cards

Use these test cards in Stripe Test Mode:

- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **Requires Auth**: `4000 0025 0000 3155`

## Production Checklist

Before going live:

- [ ] Test full flow in Stripe Test Mode
- [ ] Verify trial messaging appears on billing page
- [ ] Verify checkout shows trial period
- [ ] Test subscription creation in database
- [ ] Test trial expiration (end trial manually)
- [ ] Test cancellation during trial
- [ ] Verify webhook handles all events correctly
- [ ] Test with real card in Test Mode
- [ ] Switch to Live Mode
- [ ] Test with real card in Live Mode (small amount)
- [ ] Monitor first few real subscriptions

## Support

If you encounter issues:

1. Check Stripe Dashboard → Logs for errors
2. Check Vercel function logs for webhook errors
3. Check Supabase `subscriptions` table for data issues
4. Review webhook event payloads in Stripe Dashboard
