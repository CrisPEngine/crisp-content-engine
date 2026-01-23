#!/bin/bash

# Test script for Make.com Preview Webhook
# Usage: ./test-make-preview-webhook.sh <MAKE_PREVIEW_WEBHOOK_URL> [MAKE_PREVIEW_WEBHOOK_KEY]

WEBHOOK_URL="${1:-${MAKE_PREVIEW_WEBHOOK_URL}}"
API_KEY="${2:-${MAKE_PREVIEW_WEBHOOK_KEY}}"

if [ -z "$WEBHOOK_URL" ]; then
  echo "Error: MAKE_PREVIEW_WEBHOOK_URL is required"
  echo "Usage: ./test-make-preview-webhook.sh <MAKE_PREVIEW_WEBHOOK_URL> [MAKE_PREVIEW_WEBHOOK_KEY]"
  exit 1
fi

echo "Testing Make.com Preview Webhook..."
echo "URL: $WEBHOOK_URL"
echo ""

# Build headers
HEADERS=(-H "Content-Type: application/json")
if [ -n "$API_KEY" ]; then
  HEADERS+=(-H "x-make-apikey: $API_KEY")
  echo "Using x-make-apikey header"
else
  echo "Warning: No API key provided. Make.com webhook must have auth disabled."
fi

# Send test request
curl -X POST "$WEBHOOK_URL" \
  "${HEADERS[@]}" \
  -d '{
    "previewSessionId": "ps_test_123",
    "persona": "Founder",
    "topics": ["AI automation", "LinkedIn growth", "systems"],
    "tone": "Direct",
    "goal": "Leads",
    "utm_source": "site",
    "utm_campaign": "cce"
  }' \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -v

echo ""
echo "Expected response format:"
echo '{
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
            "body": "Post body text",
            "hooks": ["Hook 1", "Hook 2"]
          }
        ]
      }
    ]
  }
}'
