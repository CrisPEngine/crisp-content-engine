# Email Test Endpoint

## Overview

A test endpoint has been created to send all email templates for review and testing.

## Endpoint

**URL**: `/api/email/test-all`  
**Method**: `POST`  
**Content-Type**: `application/json`

## Usage

### Basic Request

```bash
curl -X POST http://localhost:3000/api/email/test-all \
  -H "Content-Type: application/json" \
  -d '{"email":"pascoe.chris@gmail.com"}'
```

### Default Email

If no email is provided, it defaults to `pascoe.chris@gmail.com`:

```bash
curl -X POST http://localhost:3000/api/email/test-all \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Response

Returns a JSON object with:
- `ok`: boolean
- `message`: string
- `summary`: object with total, success, errors counts
- `results`: array of results for each email template

Example response:
```json
{
  "ok": true,
  "message": "Test emails sent to pascoe.chris@gmail.com",
  "summary": {
    "total": 7,
    "success": 7,
    "errors": 0
  },
  "results": [
    { "template": "AuthInviteEmail", "status": "sent" },
    { "template": "AuthMagicLinkEmail", "status": "sent" },
    ...
  ]
}
```

## Email Templates Tested

1. **AuthInviteEmail** - User invitation email
2. **AuthMagicLinkEmail** - Magic link sign-in email
3. **AuthPasswordResetEmail** - Password reset email
4. **ContentApprovalDigestEmail** - Content approval reminder (with 3 sample items)
5. **ContentBatchReadyEmail** - New content batch notification
6. **OAuthReconnectEmail** - OAuth reconnection required
7. **StrategyReminderEmail** - Monthly strategy confirmation reminder

## Requirements

- `RESEND_API_KEY` must be set in environment variables
- Server must be running (`npm run dev`)
- Resend account must be configured

## Security Note

⚠️ **This endpoint should be disabled or protected in production**. Consider:
- Adding admin authentication
- Restricting to development environment only
- Adding IP whitelist
- Or removing entirely after testing

## Troubleshooting

### Error: "RESEND_API_KEY environment variable is not set"
- Check `.env.local` file has `RESEND_API_KEY=re_...`
- Restart dev server to pick up new env vars
- Verify the key is valid in Resend dashboard

### Error: "Failed to send email"
- Check Resend API key is valid
- Verify email address is correct
- Check Resend account limits/quota
- Review Resend dashboard for delivery status

## Production Testing

For production testing, you can call:
```bash
curl -X POST https://app.crispdigital.io/api/email/test-all \
  -H "Content-Type: application/json" \
  -d '{"email":"your-test-email@example.com"}'
```

Make sure to protect this endpoint in production!




