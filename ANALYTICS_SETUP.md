# Analytics Setup Guide

This app supports multiple analytics providers with cookie consent compliance.

## Available Options

### 1. Vercel Analytics (Recommended for Vercel deployments)
- **Pros:** Free, privacy-focused, zero configuration, GDPR compliant
- **Cons:** Less detailed than GA4, Vercel-only
- **Best for:** Simple page view tracking, performance monitoring

### 2. Google Analytics 4 (GA4)
- **Pros:** Free, comprehensive, industry standard, powerful insights
- **Cons:** Requires Google account, more complex setup
- **Best for:** Detailed user behavior, conversion tracking, e-commerce

### 3. PostHog (Alternative - Product Analytics)
- **Pros:** Product analytics, session replay, feature flags, free tier
- **Cons:** Paid plans for advanced features
- **Best for:** SaaS product analytics, user behavior analysis

### 4. Plausible Analytics (Alternative - Privacy-focused)
- **Pros:** Privacy-focused, GDPR compliant, simple dashboard
- **Cons:** Paid service (~$9/month)
- **Best for:** Privacy-conscious users, simple analytics

## Setup Instructions

### Option 1: Vercel Analytics (Easiest)

1. **Install the package:**
   ```bash
   npm install @vercel/analytics
   ```

2. **Update `src/components/Analytics.tsx`:**
   Add the Vercel Analytics import:
   ```tsx
   import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
   
   export function Analytics() {
     return (
       <>
         <VercelAnalytics />
         {/* Other analytics... */}
       </>
     );
   }
   ```

3. **Enable in Vercel Dashboard:**
   - Go to your Vercel project settings
   - Navigate to "Analytics"
   - Enable Web Analytics
   - No additional configuration needed!

**That's it!** Vercel Analytics will automatically track page views.

---

### Option 2: Google Analytics 4

1. **Create a GA4 Property:**
   - Go to [Google Analytics](https://analytics.google.com/)
   - Create a new GA4 property
   - Copy your **Measurement ID** (format: `G-XXXXXXXXXX`)

2. **Add Environment Variable:**
   - In Vercel: Go to Project Settings → Environment Variables
   - Add: `NEXT_PUBLIC_GA_MEASUREMENT_ID` = `G-XXXXXXXXXX`
   - Or in `.env.local` for local development:
     ```
     NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
     ```

3. **Deploy:**
   - The Analytics component will automatically detect the env var
   - GA4 will only initialize after cookie consent is accepted

**Done!** Google Analytics will track page views and user interactions.

---

### Option 3: PostHog (Product Analytics)

1. **Sign up at [PostHog](https://posthog.com/)**
2. **Install the package:**
   ```bash
   npm install posthog-js
   ```

3. **Update `src/components/Analytics.tsx`:**
   ```tsx
   import posthog from 'posthog-js';
   
   export function PostHogAnalytics() {
     useEffect(() => {
       const consent = localStorage.getItem('cookie-consent');
       if (consent !== 'accepted') return;
       
       if (typeof window !== 'undefined') {
         posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
           api_host: 'https://app.posthog.com',
         });
       }
     }, []);
     
     // ... rest of implementation
   }
   ```

4. **Add environment variable:**
   ```
   NEXT_PUBLIC_POSTHOG_KEY=your-posthog-key
   ```

---

## Cookie Consent Compliance

All analytics respect the cookie consent banner:
- Analytics **only initialize** after user accepts cookies
- If user doesn't accept, no tracking scripts are loaded
- Compliant with GDPR, CCPA, and other privacy regulations

## Custom Events

### Track Custom Events (GA4)

```tsx
// In any component
if (typeof window !== 'undefined' && (window as any).gtag) {
  (window as any).gtag('event', 'button_click', {
    event_category: 'engagement',
    event_label: 'Subscribe Button',
  });
}
```

### Track Custom Events (Vercel Analytics)

```tsx
import { track } from '@vercel/analytics';

track('button_click', {
  category: 'engagement',
  label: 'Subscribe Button',
});
```

## Testing

1. **Local Development:**
   - Set environment variables in `.env.local`
   - Accept cookie consent banner
   - Check browser console for analytics initialization
   - Use browser DevTools → Network tab to verify requests

2. **Production:**
   - Verify in Google Analytics Real-Time reports (for GA4)
   - Check Vercel Analytics dashboard (for Vercel Analytics)
   - Ensure cookie consent is working correctly

## Recommended Setup

For **CrisP Content Engine**, I recommend:

1. **Primary:** Vercel Analytics (free, easy, privacy-focused)
2. **Secondary:** Google Analytics 4 (for detailed insights)

Both can run simultaneously and respect cookie consent.

## Troubleshooting

**Analytics not working?**
- Check cookie consent is accepted
- Verify environment variables are set
- Check browser console for errors
- Ensure scripts are loading (Network tab)

**GA4 not tracking?**
- Verify `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set correctly
- Check GA4 Real-Time reports (may take a few minutes)
- Ensure cookie consent was accepted

**Vercel Analytics not showing?**
- Enable in Vercel Dashboard → Analytics
- Wait a few minutes for data to appear
- Check that `@vercel/analytics` is installed

