#!/usr/bin/env bash
# One-off test: POST a full Idea Engine payload to the Make webhook.
# Usage: ./scripts/test-idea-engine-webhook.sh
# Or:   MAKE_WEBHOOK_URL="https://hook.eu2.make.com/..." ./scripts/test-idea-engine-webhook.sh

set -e
WEBHOOK_URL="${MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL:-${MAKE_WEBHOOK_URL}}"
if [ -z "$WEBHOOK_URL" ]; then
  echo "Set MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL or MAKE_WEBHOOK_URL (or add to .env and source it)."
  exit 1
fi

PAYLOAD='{
  "series_run_id": "550e8400-e29b-41d4-a716-446655440000",
  "run_id": "660e8400-e29b-41d4-a716-446655440001",
  "user_id": "770e8400-e29b-41d4-a716-446655440002",
  "plan": "growth",
  "brand_profile_id": "recTestBrandProfile01",
  "idea": "Launch our new sustainability report and drive sign-ups to the waitlist.",
  "goal": "Traffic",
  "notes": "Test payload from script. No callback expected.",
  "selected_channels": ["LinkedIn", "X", "Blog", "Facebook", "Instagram"],
  "publish_mode": "queue_only",
  "requested_counts": { "LinkedIn": 3, "X": 4, "Blog": 1, "Facebook": 2, "Instagram": 2 },
  "quota_remaining_by_channel": { "linkedin": 10, "x": 8, "blog": 2, "meta_pool": 5 },
  "dropped_channels": [],
  "autopublish_capabilities": { "linkedin": true, "instagram": true, "facebook": true, "x": false, "blog": false },
  "timezone": "Europe/London",
  "posting_windows": null,
  "brand_context": { "client_name": "Test Brand", "timezone": "Europe/London" },
  "callback_url": "https://app.crispdigital.io/api/idea-engine/webhook/callback"
}'

echo "Sending POST to Make Idea Engine webhook..."
HTTP_CODE=$(curl -s -o /tmp/idea-engine-webhook-response.txt -w "%{http_code}" \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")
echo "HTTP status: $HTTP_CODE"
echo "Response body:"
cat /tmp/idea-engine-webhook-response.txt
echo ""
if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "Payload sent and accepted (2xx)."
else
  echo "Non-2xx response; check Make scenario logs."
  exit 1
fi
