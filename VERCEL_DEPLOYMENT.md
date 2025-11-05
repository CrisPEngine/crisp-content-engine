# Vercel Deployment Guide

## Prerequisites
1. Vercel account (sign up at https://vercel.com)
2. GitHub/GitLab/Bitbucket repository connected
3. All environment variables ready

## Deployment Steps

### 1. Connect Repository
- Go to https://vercel.com/new
- Import your Git repository
- Vercel will auto-detect Next.js

### 2. Configure Environment Variables
Add these in Vercel Dashboard → Project Settings → Environment Variables:

#### Supabase
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

#### Stripe
- `STRIPE_SECRET_KEY` - Your Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Your Stripe webhook signing secret
- `NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY`
- `NEXT_PUBLIC_STRIPE_PRICE_CREATOR_ANNUAL`
- `NEXT_PUBLIC_STRIPE_PRICE_GROWTH_MONTHLY`
- `NEXT_PUBLIC_STRIPE_PRICE_GROWTH_ANNUAL`
- `NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY`
- `NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL`
- `NEXT_PUBLIC_STRIPE_PRICE_SCALE_MONTHLY`
- `NEXT_PUBLIC_STRIPE_PRICE_SCALE_ANNUAL`

#### App URLs
- `NEXT_PUBLIC_APP_URL` - Your production URL (e.g., https://your-app.vercel.app)
- `NEXT_PUBLIC_SITE_URL` - Same as APP_URL (for auth redirects)

#### Optional
- `MAKE_API_KEY` - If you want to secure the usage increment endpoint

### 3. Update Supabase Auth Settings
In Supabase Dashboard → Authentication → URL Configuration:
- Add your Vercel production URL to "Site URL"
- Add `https://your-app.vercel.app/auth/callback` to "Redirect URLs"

### 4. Update Stripe Webhook
In Stripe Dashboard → Webhooks:
- Add endpoint: `https://your-app.vercel.app/api/stripe/webhook`
- Select events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`
- Copy the webhook signing secret to Vercel env vars

### 5. Deploy
- Push to your main branch
- Vercel will auto-deploy
- Or manually deploy from Vercel dashboard

### 6. Post-Deployment
- Test authentication flow
- Test Stripe checkout
- Verify webhook receives events
- Test cookie consent
- Verify all redirects work

## OAuth Provider Setup

### Google OAuth
1. Go to Google Cloud Console (https://console.cloud.google.com)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URI: `https://your-project.supabase.co/auth/v1/callback`
4. Copy Client ID and Client Secret
5. In Supabase Dashboard → Authentication → Providers → Google:
   - Enable Google provider
   - Add Client ID and Client Secret
   - Save

### LinkedIn OAuth
1. Go to LinkedIn Developers (https://www.linkedin.com/developers)
2. Create a new app
3. Add redirect URL: `https://your-project.supabase.co/auth/v1/callback`
4. Copy Client ID and Client Secret
5. In Supabase Dashboard → Authentication → Providers → LinkedIn:
   - Enable LinkedIn provider
   - Add Client ID and Client Secret
   - Save

## Troubleshooting
- If redirects fail, check Supabase redirect URLs include your Vercel domain
- If webhooks fail, verify the webhook secret matches
- Check Vercel function logs for errors
- Verify all env vars are set (not just in .env.local)

