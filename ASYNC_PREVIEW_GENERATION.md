# Async Preview Generation Implementation

## Overview

Preview generation has been converted from synchronous (waiting for Make response) to asynchronous (fire-and-forget with polling). This eliminates timeout issues and improves user experience.

## Architecture Changes

### Before
- `/api/preview/generate` waits for Make webhook response (up to 30s timeout)
- User waits for entire generation to complete
- Timeout errors if Make takes too long

### After
- `/api/preview/generate` fires Make webhook and returns 202 immediately
- Make calls back to `/api/preview/complete` when done
- Frontend polls `/api/preview/status` every 1s (max 60s)
- No timeouts, better UX with progress indication

## New Endpoints

### POST /api/preview/generate
- **Purpose**: Trigger async generation
- **Request**: `{ previewSessionId }`
- **Response**: `202 { previewSessionId, status: 'generating' }`
- **Behavior**: 
  - Validates session exists
  - Updates status to 'generating'
  - Fire-and-forget call to Make webhook
  - Returns immediately

### POST /api/preview/complete
- **Purpose**: Make webhook callback when generation completes
- **Auth**: `x-make-secret` header must match `MAKE_SHARED_SECRET`
- **Request**: `{ previewSessionId, outputs: { packTitle, sections } }`
- **Response**: `200 { success: true }`
- **Behavior**:
  - Validates secret header
  - Validates output schema strictly
  - Updates session status to 'generated'
  - Stores outputs JSON

### GET /api/preview/status
- **Purpose**: Poll for generation status
- **Query**: `?previewSessionId=<id>`
- **Response**: 
  - `{ previewSessionId, status, outputs? }` (if generated)
  - `{ previewSessionId, status, error? }` (if failed)
- **Behavior**:
  - Returns current status
  - Includes outputs only if status='generated'
  - Includes error if status='failed'

## Frontend Changes

### PreviewClient.tsx
- **Polling**: Polls `/api/preview/status` every 1s after triggering generation
- **Timeout**: Stops polling after 60s
- **Loading Copy**: Updated to "This takes ~30 seconds"
- **State Management**: 
  - Cleans up polling intervals on unmount
  - Handles resuming sessions from URL params
  - Shows progress while polling

## Make.com Scenario Changes

### Required Updates
1. **Remove**: Webhook Response module that returns to Vercel
2. **Add**: HTTP Request module to call `/api/preview/complete`
3. **URL**: `https://app.crispdigital.io/api/preview/complete`
4. **Method**: POST
5. **Headers**:
   - `Content-Type: application/json`
   - `x-make-secret: <MAKE_SHARED_SECRET>`
6. **Body**: 
   ```json
   {
     "previewSessionId": "{{previewSessionId}}",
     "outputs": {
       "packTitle": "...",
       "sections": [...]
     }
   }
   ```

## Environment Variables

### Required
- `MAKE_PREVIEW_WEBHOOK_URL` - Make webhook URL to trigger generation
- `MAKE_SHARED_SECRET` - Secret for authenticating `/api/preview/complete` calls from Make
- `MAKE_PREVIEW_WEBHOOK_KEY` (optional) - API key for Make webhook auth

### Existing (no changes)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Route Configuration

All preview API routes include:
```typescript
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
```

## Status Flow

1. **created** → User clicks "Generate"
2. **generating** → `/api/preview/generate` called, Make webhook triggered
3. **generated** → Make calls `/api/preview/complete` with outputs
4. **failed** → Error occurs during generation or validation

## Error Handling

- **Network errors**: Logged but don't block response
- **Validation errors**: Return 422 with clear message
- **Timeout**: Frontend stops polling after 60s, shows error
- **Invalid outputs**: Rejected with detailed validation errors

## Testing Checklist

- [ ] Generate preview successfully
- [ ] Polling works and shows progress
- [ ] Make webhook calls `/api/preview/complete` correctly
- [ ] Status endpoint returns correct status
- [ ] Resuming from URL param works
- [ ] Timeout after 60s shows error
- [ ] Invalid Make responses are rejected
- [ ] Secret authentication works on `/api/preview/complete`
