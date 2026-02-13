# Creator Plan Pricing Update

**Date**: February 3, 2026  
**Change**: Reduced Creator plan pricing from $19/month to $9/month

## Summary

The Creator plan pricing has been updated:
- **Monthly**: $19/month → **$9/month** (52% reduction)
- **Annual**: $190/year → **$90/year** (52% reduction)

All other plan features remain unchanged:
- 8 auto-published LinkedIn posts per month
- 2 long-form blog articles per month
- Personal brand onboarding
- Manual blog export (Word/PDF/Markdown)
- LinkedIn connection required
- **14-day free trial** (unchanged)

## Implementation Details

### 1. Code Changes

**File**: `src/config/pricing.ts`
- Updated `priceText` for Creator monthly: `"$9/mo"`
- Updated `priceText` for Creator annual: `"$90/yr"`
- Updated `PRICE_TO_PLAN` mapping to support both new and legacy prices

**File**: `.env.example`
- Updated documentation to reflect new pricing: `($9/month, $90/year)`

### 2. Stripe Setup Required

You need to create **new Price IDs** in Stripe Dashboard for the $9 pricing:

1. Go to Stripe Dashboard → Products → Creator Plan
2. Create new recurring price: **$9.00 USD per month**
3. Create new recurring price: **$90.00 USD per year**
4. Copy the new Price IDs (format: `price_xxxxx`)
5. Update your `.env` file:
   ```bash
   NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY=price_[new_monthly_id]
   NEXT_PUBLIC_STRIPE_PRICE_CREATOR_ANNUAL=price_[new_annual_id]
   ```

### 3. Legacy Price Handling

The system supports both old ($19) and new ($9) prices:
- **New signups**: Use the new $9 price IDs from environment variables
- **Legacy prices**: Old price IDs are kept in the code for backward compatibility
  - `price_1SPjYEK763RD3TkNNi3ov5Ep` (legacy $19/month)
  - `price_1SPjrTK763RD3TkNS1tQPWdF` (legacy $190/year)
- Both resolve to `plan: "creator"` in the system

### 4. Existing Subscribers

**Policy**: Cancel and restart subscription
- There is only one existing Creator subscriber
- They will cancel their current $19/month subscription
- They will create a new subscription at the $9/month rate
- This approach avoids complex migration logic

## Deployment Steps

1. **Create New Stripe Prices** (do this first):
   ```
   - Creator Monthly: $9.00 USD
   - Creator Annual: $90.00 USD
   ```

2. **Update Environment Variables**:
   ```bash
   # In Vercel Dashboard or .env file
   NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY=price_[new_id]
   NEXT_PUBLIC_STRIPE_PRICE_CREATOR_ANNUAL=price_[new_id]
   ```

3. **Deploy Code**:
   ```bash
   git add src/config/pricing.ts .env.example
   git commit -m "Update Creator pricing: $19 → $9/month, $190 → $90/year"
   git push
   ```

4. **Handle Existing Subscriber**:
   - Notify the user about the price reduction
   - Ask them to:
     1. Cancel their current subscription in Billing settings
     2. Sign up again for the new $9/month Creator plan
     3. They'll get a fresh 14-day free trial

## QA Checklist

Before going live, verify:

### Pricing Display
- [ ] Billing page shows **$9/mo** for Creator monthly
- [ ] Billing page shows **$90/yr** for Creator annual
- [ ] Trial banner still shows "Risk Free 14 day free trial"
- [ ] Footer still mentions "Creator plan: Risk Free 14 day free trial"

### Checkout Flow
- [ ] New Creator monthly signup charges $9 (after trial)
- [ ] New Creator annual signup charges $90 (after trial)
- [ ] 14-day trial is applied correctly
- [ ] Stripe checkout session uses correct new price ID

### Subscription Management
- [ ] Existing subscriptions continue to work (if any remain)
- [ ] Plan resolution works for both legacy and new prices
- [ ] Upgrade/downgrade flows work correctly
- [ ] Usage tracking works correctly
- [ ] Content generation respects Creator limits

### Backend
- [ ] Webhook handler recognizes new price IDs
- [ ] Plan resolution maps new prices to "creator"
- [ ] Entitlements are set correctly for Creator plan
- [ ] LinkedIn autopublish works for Creator users

## Benefits of New Pricing

1. **Lower barrier to entry**: $9/month is more accessible for solo creators
2. **Better value proposition**: Starter ($5) → Creator ($9) upgrade is only $4/month
3. **Competitive positioning**: More competitive with other content tools
4. **Annual discount maintained**: Annual plan still saves 20% ($90 vs $108)

## Notes

- **Trial period unchanged**: 14-day free trial remains for Creator plan
- **Features unchanged**: All Creator features remain the same
- **Starter plan unaffected**: Starter plan remains at $5/month
- **Higher tiers unaffected**: Growth, Pro, and Scale pricing unchanged
- **No grandfathering needed**: Single user will restart subscription

## Support Resources

- **Stripe Dashboard**: https://dashboard.stripe.com/products
- **Environment Variables**: Set in Vercel Dashboard → Settings → Environment Variables
- **Pricing Configuration**: `src/config/pricing.ts`
- **Checkout Logic**: `src/app/api/checkout/route.ts`
- **Webhook Handler**: `src/app/api/stripe/webhook/route.ts`

## Rollback Plan

If you need to revert the pricing:

1. Update `src/config/pricing.ts`:
   - Change `priceText` back to `"$19/mo"` and `"$190/yr"`
2. Update environment variables to use original price IDs:
   - `NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY=price_1SPjYEK763RD3TkNNi3ov5Ep`
   - `NEXT_PUBLIC_STRIPE_PRICE_CREATOR_ANNUAL=price_1SPjrTK763RD3TkNS1tQPWdF`
3. Deploy changes

The system is designed to handle this gracefully without breaking existing subscriptions.
