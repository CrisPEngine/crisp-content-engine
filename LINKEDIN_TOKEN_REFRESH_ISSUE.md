# LinkedIn Token Refresh Issue - Frequent Reauthentication

## Problem

One user account requires reauthentication approximately once a week, while others don't. The error shows:
- `REVOKED_ACCESS_TOKEN` when trying to publish
- `invalid_grant` when trying to refresh (refresh token is also expired/revoked)

## Root Cause

LinkedIn refresh tokens can expire for several reasons:

1. **LinkedIn Refresh Token Expiration Policy**:
   - Refresh tokens typically expire after 60 days of **inactivity**
   - If a refresh token isn't used for 60 days, LinkedIn revokes it
   - Some LinkedIn apps/accounts have shorter token lifetimes

2. **Account-Specific Factors**:
   - Business/Enterprise LinkedIn accounts may have stricter token policies
   - Accounts with higher security settings may have shorter token lifetimes
   - Accounts that publish frequently might trigger LinkedIn's rate limiting/security

3. **Current Behavior**:
   - Tokens are only refreshed when access token expires within 5 minutes
   - Refresh tokens are only used when access tokens need refreshing
   - If a user doesn't publish for a while, the refresh token might expire from inactivity

## Why This User Specifically

Possible reasons this user's tokens expire faster:
- Their LinkedIn account has stricter security settings
- They're using a business/enterprise account with different token policies
- Their refresh token was obtained with different scopes
- LinkedIn is expiring tokens for accounts with specific usage patterns
- The refresh token isn't being used frequently enough (LinkedIn expires unused refresh tokens)

## Solution

### Option 1: Proactive Token Refresh (Recommended)
Refresh tokens periodically (e.g., weekly) even if access tokens are still valid. This keeps refresh tokens "active" and prevents expiration.

**Implementation**:
- Add a cron job that runs weekly
- For each LinkedIn connection, refresh the token if it hasn't been refreshed in the last 7 days
- This keeps refresh tokens active and prevents expiration

### Option 2: Refresh on Every Use
Always refresh tokens when they're accessed, not just when they're about to expire.

**Implementation**:
- Modify `processLinkedInConnection` to refresh tokens more aggressively
- Refresh if token hasn't been refreshed in last 7 days, regardless of expiration

### Option 3: Better Error Handling & User Communication
Improve messaging when tokens expire to help users understand why.

## Recommended Fix

Implement **Option 1** - Proactive Token Refresh:

1. Create a cron job endpoint: `/api/cron/refresh-linkedin-tokens`
2. Run weekly (e.g., every Sunday)
3. For each LinkedIn connection:
   - Check `updated_at` or `last_refresh_at` field
   - If not refreshed in last 7 days, refresh the token
   - This keeps refresh tokens active and prevents expiration

This ensures refresh tokens are used regularly, preventing LinkedIn from expiring them due to inactivity.

