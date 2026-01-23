# Make.com Preview Webhook Test

## Updated Implementation

The preview generation endpoint now:
- Uses Make's native API key authentication with header `x-make-apikey`
- Uses `MAKE_PREVIEW_WEBHOOK_KEY` environment variable (no fallback)
- Sends `utm_source` and `utm_campaign` in the payload
- Only sends `x-make-apikey` header if `MAKE_PREVIEW_WEBHOOK_KEY` is set
- Single auth mechanism (API key only, no shared secret)

## Test Request

### Basic curl command (without secret):

```bash
curl -X POST "<MAKE_PREVIEW_WEBHOOK_URL>" \
  -H "Content-Type: application/json" \
  -d '{
    "previewSessionId": "ps_test_123",
    "persona": "Founder",
    "topics": ["AI automation", "LinkedIn growth", "systems"],
    "tone": "Direct",
    "goal": "Leads",
    "utm_source": "site",
    "utm_campaign": "cce"
  }'
```

### With Make API key header:

```bash
curl -X POST "<MAKE_PREVIEW_WEBHOOK_URL>" \
  -H "Content-Type: application/json" \
  -H "x-make-apikey: <MAKE_PREVIEW_WEBHOOK_KEY>" \
  -d '{
    "previewSessionId": "ps_test_123",
    "persona": "Founder",
    "topics": ["AI automation", "LinkedIn growth", "systems"],
    "tone": "Direct",
    "goal": "Leads",
    "utm_source": "site",
    "utm_campaign": "cce"
  }'
```

### Using the test script:

```bash
./test-make-preview-webhook.sh <MAKE_PREVIEW_WEBHOOK_URL> [MAKE_PREVIEW_WEBHOOK_KEY]
```

Or with environment variables:

```bash
export MAKE_PREVIEW_WEBHOOK_URL="https://..."
export MAKE_PREVIEW_WEBHOOK_KEY="your-api-key"
./test-make-preview-webhook.sh
```

## Payload Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `previewSessionId` | string | Yes | Unique session identifier |
| `persona` | string | Yes | User persona (Founder, Consultant, Agency, Local business, Ecommerce brand) |
| `topics` | array | Yes | Array of topic strings (up to 3) |
| `tone` | string | Yes | Content tone (Direct, Thoughtful, Bold, Practical) |
| `goal` | string | Yes | Content goal (Awareness, Leads, Trust, Sales) |
| `utm_source` | string | Optional | UTM source parameter |
| `utm_campaign` | string | Optional | UTM campaign parameter |

## Expected Response

```json
{
  "previewSessionId": "ps_test_123",
  "status": "generated",
  "outputs": {
    "packTitle": "Your Content System Title",
    "sections": [
      {
        "name": "Point of view",
        "posts": [
          {
            "title": "Post title",
            "body": "Post body text\nwith line breaks",
            "hooks": ["Hook 1", "Hook 2"]
          },
          {
            "title": "Post title 2",
            "body": "Post body text 2",
            "hooks": ["Hook 1", "Hook 2"]
          },
          {
            "title": "Post title 3",
            "body": "Post body text 3",
            "hooks": ["Hook 1", "Hook 2"]
          }
        ]
      },
      {
        "name": "How-to",
        "posts": [ /* 3 posts */ ]
      },
      {
        "name": "Proof or story",
        "posts": [ /* 3 posts */ ]
      }
    ]
  }
}
```

## Response Requirements

- **Exactly 3 sections** in this order: "Point of view", "How-to", "Proof or story"
- **Exactly 3 posts per section** (9 posts total)
- **Each post must have**: `title`, `body`, `hooks` (array of exactly 2 strings)
- **No emojis** in any field
- **No hashtags** in any field
- **No extra keys** beyond the schema
