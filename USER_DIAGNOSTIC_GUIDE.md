# User Diagnostic Guide

## Problem

Users appear in Supabase `auth.users` but don't show up in the admin dashboard because they don't have records in the `profiles` table.

## Why This Happens

When a user signs up via Supabase Auth, they get an entry in `auth.users`, but a profile record is only created when:
1. They complete the onboarding flow
2. They log in for the first time (if profile creation trigger exists)
3. A profile is manually created

If a user signs up but never completes onboarding or the profile creation fails, they'll exist in `auth.users` but not in `profiles`.

## How to Check These Users

### Method 1: Admin Dashboard (Easiest)

1. Go to `/admin` in your app
2. Check the checkbox: **"Include users without profiles (auth-only users)"**
3. Click "Search" (or search for specific emails)
4. Users without profiles will show with a **"No Profile"** warning badge
5. Click on any user to see their details

### Method 2: Batch Diagnose Endpoint

Use the batch diagnose endpoint to check multiple users at once:

```bash
curl -X POST https://app.crispdigital.io/api/admin/users/batch-diagnose \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-admin-session-cookie>" \
  -d '{
    "user_ids": [
      "223a9a3f-67ff-4b4c-a0fd-e3918a6005c4",
      "33f4998e-0ff1-40b4-b6c6-6a0d7ce5a580",
      "cea9f8cf-c4c4-43d5-b0cd-b743c71bf3ac",
      "a2550a70-af82-4b68-b878-e12abe355228",
      "6323b8fb-acaa-419f-8b46-2c4f007a6804",
      "f16450f9-c89c-4994-afa3-a5b8c5abed7c",
      "ae334e67-19ab-4af9-8f4b-79a9d1975030"
    ]
  }'
```

### Method 3: Individual User Diagnose

Check a single user:

```bash
curl https://app.crispdigital.io/api/admin/users/diagnose?user_id=223a9a3f-67ff-4b4c-a0fd-e3918a6005c4 \
  -H "Cookie: <your-admin-session-cookie>"
```

## Users to Check

| Email | User ID | Status |
|-------|---------|--------|
| behag73384@crsay.com | 223a9a3f-67ff-4b4c-a0fd-e3918a6005c4 | To check |
| farhanyen10@gmail.com | 33f4998e-0ff1-40b4-b6c6-6a0d7ce5a580 | To check |
| jindeq@126.com | cea9f8cf-c4c4-43d5-b0cd-b743c71bf3ac | To check |
| khalidanir16@gmail.com | a2550a70-af82-4b68-b878-e12abe355228 | To check |
| mironovtech@gmail.com | 6323b8fb-acaa-419f-8b46-2c4f007a6804 | To check |
| parekhdarshan07@gmail.com | f16450f9-c89c-4994-afa3-a5b8c5abed7c | To check |
| savunvan27@gmail.com | ae334e67-19ab-4af9-8f4b-79a9d1975030 | To check |

## What to Look For

For each user, check:

1. **Auth Status**: Do they exist in `auth.users`?
   - ✅ Yes → They signed up
   - ❌ No → User doesn't exist

2. **Profile Status**: Do they have a `profiles` record?
   - ✅ Yes → Normal user
   - ❌ No → **Issue**: User signed up but profile wasn't created

3. **Email Confirmed**: Is their email confirmed?
   - ✅ Yes → They verified their email
   - ❌ No → They may have signed up but never verified

4. **Last Sign In**: When did they last sign in?
   - Recent → Active user
   - Never → Signed up but never logged in

5. **Subscription**: Do they have a subscription?
   - ✅ Yes → They completed onboarding
   - ❌ No → They may not have completed onboarding

6. **Social Connections**: Do they have any LinkedIn connections?
   - ✅ Yes → They connected social accounts
   - ❌ No → They may not have completed onboarding

## Common Scenarios

### Scenario 1: Signed Up, Never Verified Email
- ✅ Exists in `auth.users`
- ❌ No profile
- ❌ Email not confirmed
- ❌ No last sign in
- **Action**: User signed up but never verified email, so they can't log in

### Scenario 2: Signed Up, Verified, But Profile Creation Failed
- ✅ Exists in `auth.users`
- ✅ Email confirmed
- ❌ No profile
- ✅ Has last sign in
- **Action**: Profile creation may have failed. Check logs for errors.

### Scenario 3: Signed Up, Started Onboarding, Never Finished
- ✅ Exists in `auth.users`
- ✅ Email confirmed
- ✅ Has profile
- ❌ No subscription
- ❌ No connections
- **Action**: User started onboarding but didn't complete it.

## Next Steps

1. **Check each user** using the admin dashboard or diagnostic endpoints
2. **Determine their status** based on the checklist above
3. **Decide on action**:
   - If they never verified email → Can delete or send verification email
   - If profile creation failed → Create profile manually or investigate why
   - If they're stuck in onboarding → Help them complete or clean up

## Creating Missing Profiles

If a user has an auth account but no profile, you can create one:

1. Go to admin dashboard
2. Find the user (with "Include users without profiles" checked)
3. Click on the user
4. The system will show their auth info
5. You may need to manually create a profile record in Supabase or use the create user feature
