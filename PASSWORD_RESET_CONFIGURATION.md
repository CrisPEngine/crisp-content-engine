# Password Reset Configuration Guide

## Issue Summary

When users click "Forgot Password" on the login page, they receive a recovery email. If the redirect URL in the email doesn't match exactly what's configured in Supabase, the link will fail with an "otp_expired" or "access_denied" error.

## Root Cause

The issue lies in **Supabase configuration**, specifically:

1. **Redirect URL Mismatch**: The redirect URL in the recovery email must match EXACTLY what's in Supabase's allowed redirect URLs list
2. **Site URL Configuration**: Supabase uses the Site URL as a fallback when redirect URLs don't match
3. **Token Expiration**: Tokens can expire if not used promptly or if email clients prefetch links

## Where the Issue Lies

### Supabase (Primary Issue)
- **Redirect URLs Configuration**: Must include the exact URL used in recovery emails
- **Site URL Configuration**: Should match your production domain
- **Token Expiration Settings**: May need adjustment if tokens expire too quickly

### App Code (Secondary)
- **Redirect URL Consistency**: The `redirectTo` prop in Auth component must match Supabase config
- **Error Handling**: Should gracefully handle expired tokens

### Vercel (Not an Issue)
- Vercel is just hosting the app; the issue is configuration, not deployment

## Required Supabase Configuration

### 1. Site URL
In Supabase Dashboard → Authentication → URL Configuration:
- **Site URL**: `https://app.crispdigital.io` (must match your production domain exactly)

### 2. Redirect URLs (Critical!)
Add these EXACT URLs (case-sensitive, must match exactly):
- `https://app.crispdigital.io/auth/callback`
- `https://app.crispdigital.io/login`
- `https://app.crispdigital.io/dashboard`
- `https://app.crispdigital.io/billing`

**Important**: 
- URLs are case-sensitive
- Must include `https://` protocol
- No trailing slashes (unless you use them consistently)
- Must match exactly what's in the code

### 3. Email Template Configuration
In Supabase Dashboard → Authentication → Email Templates:
- Ensure "Reset Password" template uses `{{ .RedirectTo }}` variable
- The redirect URL in emails will use the `redirectTo` value from your app

## How Password Reset Works

### For Existing Users (Forgot Password)
1. User clicks "Forgot Password" on login page
2. Supabase Auth UI calls `resetPasswordForEmail()`
3. Supabase sends recovery email with link: `https://app.crispdigital.io/auth/callback?type=recovery&token_hash=...`
4. User clicks link → goes to `/auth/callback`
5. Callback route detects `type=recovery` and redirects to `/login?type=recovery&token_hash=...`
6. Login page detects recovery type and shows password update form

### For New Users (Admin Created)
1. Admin creates user via `/api/admin/users/create`
2. Code calls `inviteUserByEmail()` which sends invite email
3. Email contains link: `https://app.crispdigital.io/auth/callback?type=invite&token_hash=...`
4. Same flow as above, but with `type=invite`

## Troubleshooting

### Error: "Email link is invalid or has expired"
**Causes:**
1. Redirect URL doesn't match Supabase allowed list
2. Token expired (default is 1 hour)
3. Email client prefetched the link (consumed the one-time token)

**Solutions:**
1. Verify redirect URL in Supabase matches exactly
2. Check token expiration settings in Supabase
3. Consider implementing OTP-based reset as alternative

### Error: "access_denied"
**Causes:**
1. Redirect URL not in allowed list
2. Site URL misconfigured

**Solutions:**
1. Add exact redirect URL to Supabase allowed list
2. Verify Site URL matches production domain

## Verification Steps

1. **Check Supabase Configuration:**
   - Go to Authentication → URL Configuration
   - Verify Site URL: `https://app.crispdigital.io`
   - Verify Redirect URLs include: `https://app.crispdigital.io/auth/callback`

2. **Test Password Reset:**
   - Go to login page
   - Click "Forgot Password"
   - Enter email and submit
   - Check email for recovery link
   - Click link - should go to `/auth/callback` then redirect to `/login` with password form

3. **Check Server Logs:**
   - Look for errors in callback route
   - Check for token validation errors

## Code References

- **Login Component**: `src/app/(site)/login/LoginClient.tsx`
  - `redirectTo` prop must match Supabase config
  
- **Callback Route**: `src/app/auth/callback/route.ts`
  - Handles `type=recovery` and `type=invite`
  - Redirects to `/login` with token parameters

- **Admin User Creation**: `src/app/api/admin/users/create/route.ts`
  - Uses `inviteUserByEmail()` for new users
  - Redirect URL: `/auth/callback`

## Email Template Configuration

### Required Templates

Supabase requires email templates to be configured for different authentication flows:

1. **Reset Password** (for existing users who forgot password)
   - Location: Supabase Dashboard → Authentication → Email Templates → "Reset Password"
   - Should be enabled by default
   - **CRITICAL**: Must include token parameters in the link
   - Use: `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`
   - OR use: `{{ .ConfirmationURL }}` (includes all parameters automatically)

2. **Invite** (for newly created users)
   - Location: Supabase Dashboard → Authentication → Email Templates → "Invite"
   - **Must be enabled** for admin-created users to receive emails
   - Uses `{{ .RedirectTo }}` and `{{ .TokenHash }}` variables

### How to Enable/Configure Email Templates

1. Go to Supabase Dashboard → Authentication → Email Templates
2. Find the "Invite" template
3. Click "Enable" if it's disabled
4. Customize the template if needed (optional)
5. Ensure the template includes:
   - A link with `{{ .RedirectTo }}` and `{{ .TokenHash }}`
   - Example: `<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite">Set Password</a>`

### Email Sending Requirements

- Email sending must be enabled in your Supabase project
- For production, consider configuring custom SMTP (Settings → Auth → SMTP Settings)
- Default Supabase email service has rate limits

## Additional Notes

- Tokens are single-use and expire after 1 hour by default
- Email clients that prefetch links can consume tokens prematurely
- Consider adding OTP (One-Time Password) as alternative to links
- Monitor Supabase logs for authentication errors
- Check Supabase Dashboard → Logs → Auth Logs for email sending errors

