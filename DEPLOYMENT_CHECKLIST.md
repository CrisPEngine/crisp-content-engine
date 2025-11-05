# Pre-Deployment Checklist

## ✅ Code Ready
- [x] Header with logo (90px height)
- [x] Cookie consent implemented
- [x] Footer with privacy policy
- [x] Auth flow (login → callback → onboarding/app)
- [x] Stripe checkout and webhooks
- [x] Usage tracking and caps enforcement
- [x] Plan usage cards

## 🔧 Supabase Configuration

### OAuth Providers Setup

#### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Application type: Web application
6. Authorized redirect URIs: `https://glqippdvtnydugejronn.supabase.co/auth/v1/callback`
7. Copy Client ID and Client Secret
8. In Supabase Dashboard → Authentication → Providers → Google:
   - Enable Google provider
   - Paste Client ID and Client Secret
   - Save

#### LinkedIn OAuth
1. Go to [LinkedIn Developers](https://www.linkedin.com/developers)
2. Create a new app
3. Fill in app details (name, logo, etc.)
4. In "Auth" tab:
   - Add redirect URL: `https://glqippdvtnydugejronn.supabase.co/auth/v1/callback`
   - Request these scopes: `openid`, `profile`, `email`
5. Copy Client ID and Client Secret
6. In Supabase Dashboard → Authentication → Providers → LinkedIn:
   - Enable LinkedIn provider
   - Paste Client ID and Client Secret
   - Save

### Supabase Redirect URLs
In Supabase Dashboard → Authentication → URL Configuration:
- Site URL: Your Vercel production URL (e.g., `https://your-app.vercel.app`)
- Redirect URLs: Add:
  - `https://your-app.vercel.app/auth/callback`
  - `https://your-app.vercel.app/app`
  - `https://your-app.vercel.app/dashboard`

## 🚀 Vercel Deployment Steps

### 1. Install Vercel CLI (Optional)
```bash
npm i -g vercel
```

### 2. Deploy via CLI
```bash
vercel
```
Follow prompts to link project.

### 3. Or Deploy via Dashboard
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your Git repository
3. Vercel auto-detects Next.js
4. Click "Deploy"

### 4. Add Environment Variables
In Vercel Dashboard → Your Project → Settings → Environment Variables:

**Supabase:**
```
NEXT_PUBLIC_SUPABASE_URL=https://glqippdvtnydugejronn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Stripe:**
```
STRIPE_SECRET_KEY=sk_live_... (your Stripe secret key)
STRIPE_WEBHOOK_SECRET=whsec_... (your webhook secret)
NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY=price_1SPjYEK763RD3TkNNi3ov5Ep
NEXT_PUBLIC_STRIPE_PRICE_CREATOR_ANNUAL=price_1SPjrTK763RD3TkNS1tQPWdF
NEXT_PUBLIC_STRIPE_PRICE_GROWTH_MONTHLY=price_1SPjdxK763RD3TkNdDIE1ZlQ
NEXT_PUBLIC_STRIPE_PRICE_GROWTH_ANNUAL=price_1SPjw4K763RD3TkN0Mq1mLKv
NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY=price_1SPjidK763RD3TkNaIU3wgYn
NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL=price_1SPk2WK763RD3TkND7iPZifZ
NEXT_PUBLIC_STRIPE_PRICE_SCALE_MONTHLY=price_1SPjlgK763RD3TkNPo6Z1kJp
NEXT_PUBLIC_STRIPE_PRICE_SCALE_ANNUAL=price_1SPk5SK763RD3TkNVXNPFHk6
```

**App URLs:**
```
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app
```

### 5. Update Stripe Webhook
1. In Stripe Dashboard → Webhooks
2. Add endpoint: `https://your-app.vercel.app/api/stripe/webhook`
3. Select events:
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.updated`
4. Copy the webhook signing secret
5. Update `STRIPE_WEBHOOK_SECRET` in Vercel env vars

### 6. Redeploy
After adding env vars, trigger a new deployment:
- Via CLI: `vercel --prod`
- Via Dashboard: Click "Redeploy" on latest deployment

## ✅ Post-Deployment Testing

1. **Authentication**
   - [ ] Test Google OAuth login
   - [ ] Test LinkedIn OAuth login
   - [ ] Test email/password login
   - [ ] Verify redirect to `/app` after login
   - [ ] Verify redirect to `/onboarding` if no subscription

2. **Profile Creation**
   - [ ] Verify profile created on first login
   - [ ] Check `profiles` table in Supabase

3. **Billing**
   - [ ] Test Stripe checkout flow
   - [ ] Verify subscription created in DB
   - [ ] Verify entitlements created
   - [ ] Test billing portal access

4. **Usage Tracking**
   - [ ] Test `/api/usage/increment` endpoint
   - [ ] Verify usage counts in `usage_posts` table
   - [ ] Check usage card displays correctly

5. **Content Scheduling**
   - [ ] Test `/api/content/schedule` with valid user
   - [ ] Verify caps enforcement works
   - [ ] Test rejection when limit reached

6. **UI/UX**
   - [ ] Verify logo displays correctly
   - [ ] Test cookie consent banner
   - [ ] Check footer links work
   - [ ] Verify responsive design

## 🔍 Monitoring

- Check Vercel function logs for errors
- Monitor Supabase logs for auth issues
- Check Stripe webhook delivery logs
- Set up error tracking (Sentry, etc.) if needed

## 📝 Next Steps After Deployment

1. Set up custom domain (optional)
2. Configure production database backups
3. Set up monitoring/alerts
4. Document API endpoints for Make integration
5. Create user onboarding flow
6. Build content creation/scheduling UI

