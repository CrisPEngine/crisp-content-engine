# Supabase Email Template Fix

## Problem

The password reset email link is missing the token parameters, so clicking it just redirects to the home page without allowing password reset.

## Root Cause

The email template is using:
```html
<a href="{{ .RedirectTo }}">
```

But this only includes the redirect URL without the `token_hash` and `type` parameters needed for password reset.

## Solution

Update the email template in Supabase to include the token parameters.

### Option 1: Use ConfirmationURL (Recommended)

Replace the link with:
```html
<a href="{{ .ConfirmationURL }}">
```

The `{{ .ConfirmationURL }}` variable automatically includes:
- The redirect URL
- The token_hash
- The type parameter
- All other necessary parameters

### Option 2: Manually Construct URL

If you need more control, use:
```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">
```

## Steps to Fix

1. Go to **Supabase Dashboard** → **Authentication** → **Email Templates**
2. Click on **"Reset Password"** template
3. Find the reset password button/link in the HTML
4. Replace:
   ```html
   <a href="{{ .RedirectTo }}">
   ```
   
   With:
   ```html
   <a href="{{ .ConfirmationURL }}">
   ```
   
   OR:
   ```html
   <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">
   ```

5. Click **"Save"**

## Updated Email Template Code

Here's the corrected version of your email template with the fix:

```html
<!DOCTYPE html>
<html lang="en" style="margin:0;padding:0;background:#0E0F11;color:#fff;font-family:'Inter',Arial,sans-serif;">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset Password | CrisP Content Engine</title>
  </head>
  <body style="margin:0;padding:0;background:#0E0F11;color:#E5E7EB;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0E0F11;">
      <tr>
        <td align="center" style="padding:40px 0;">
          <table width="480" cellpadding="0" cellspacing="0" role="presentation" style="background:#121417;border-radius:16px;overflow:hidden;border:1px solid #1F2937;">
            <tr>
              <td align="center" style="padding:32px 24px 16px 24px;">
                <img 
                  src="https://res.cloudinary.com/dr75zvtso/image/upload/f_auto,q_auto,w_360/v1762325831/CrispContentEngineLogo_white_1200x627_ojrxn6.png"
                  alt="CrisP Content Engine" 
                  width="180" 
                  height="94"
                  style="margin-bottom:24px;border:none;display:block;"
                />
                <h1 style="font-size:22px;color:#FFFFFF;font-weight:600;margin:0;">Reset your password</h1>
                <p style="color:#9CA3AF;font-size:15px;line-height:22px;margin:16px 0 28px 0;">
                  We received a request to reset your CrisP Content Engine password.<br/>
                  Click the button below to securely set a new password.
                </p>
                <a 
                  href="{{ .ConfirmationURL }}" 
                  style="display:inline-block;background:#39FF14;color:#000;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:15px;"
                >
                  Reset Password
                </a>
                <p style="color:#6B7280;font-size:13px;line-height:20px;margin:32px 0 0;">
                  If you didn't request a password reset, you can safely ignore this email.<br/>
                  Your password will remain unchanged.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px;border-top:1px solid #1F2937;color:#6B7280;font-size:12px;">
                © {{ .Now.Format "2006" }} CrisP Digital — All rights reserved.<br />
                Made with ⚡ in Dubai.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Key Change

**Before:**
```html
<a href="{{ .RedirectTo }}">
```

**After:**
```html
<a href="{{ .ConfirmationURL }}">
```

## Why This Works

- `{{ .RedirectTo }}` = Just the redirect URL (e.g., `https://app.crispdigital.io/auth/callback`)
- `{{ .ConfirmationURL }}` = Full URL with all parameters (e.g., `https://app.crispdigital.io/auth/callback?token_hash=abc123&type=recovery`)

The `ConfirmationURL` variable automatically includes:
- The redirect URL you specified
- The `token_hash` parameter
- The `type=recovery` parameter
- Any other necessary authentication parameters

## Testing

After updating the template:
1. Request a password reset
2. Check the email
3. The link should now be: `https://app.crispdigital.io/auth/callback?token_hash=...&type=recovery`
4. Clicking it should redirect to `/login` with the password update form

