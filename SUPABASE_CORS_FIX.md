# Supabase CORS Error Fix

## Issue
CORS errors when Supabase tries to automatically refresh access tokens:
```
Access to fetch at 'https://glqippdvtnydugejronn.supabase.co/auth/v1/token?grant_type=refresh_token' 
from origin 'https://app.crispdigital.io' has been blocked by CORS policy
```

## Why This Happens
Supabase automatically refreshes access tokens in the background. If your production domain isn't in Supabase's allowed origins, these refresh requests fail with CORS errors.

## Impact
- **Non-critical**: The app still works fine
- Users can still use all features
- They'll just need to log in again when their session expires (instead of automatic refresh)
- API calls work because they use server-side authentication

## Fix: Configure Supabase Dashboard

### Step 1: Go to Supabase Dashboard
1. Navigate to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Authentication** → **URL Configuration**

### Step 2: Add Your Production Domain
In the **Site URL** field, ensure it's set to:
```
https://app.crispdigital.io
```

### Step 3: Add Redirect URLs
In the **Redirect URLs** section, add:
```
https://app.crispdigital.io
https://app.crispdigital.io/auth/callback
https://app.crispdigital.io/dashboard
https://app.crispdigital.io/*
```

### Step 4: Save
Click **Save** to apply the changes.

## Alternative: Suppress Console Errors (Optional)

If you want to suppress these errors in the console (they're harmless), we can add error handling to the Supabase client configuration. However, the proper fix is to configure Supabase as above.

## Verification
After updating Supabase settings:
1. Clear browser cache
2. Log out and log back in
3. Wait a few minutes (token refresh happens automatically)
4. Check console - CORS errors should be gone

## Notes
- This only affects automatic token refresh
- All API calls work fine (they use server-side auth)
- Users can still use the app normally
- They'll just need to log in again when session expires (instead of seamless refresh)

