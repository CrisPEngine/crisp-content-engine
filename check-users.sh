#!/bin/bash

# Script to check specific users in the system
# Usage: ./check-users.sh

echo "Checking users..."
echo ""

# User IDs to check
USER_IDS=(
  "223a9a3f-67ff-4b4c-a0fd-e3918a6005c4"
  "33f4998e-0ff1-40b4-b6c6-6a0d7ce5a580"
  "cea9f8cf-c4c4-43d5-b0cd-b743c71bf3ac"
  "a2550a70-af82-4b68-b878-e12abe355228"
  "6323b8fb-acaa-419f-8b46-2c4f007a6804"
  "f16450f9-c89c-4994-afa3-a5b8c5abed7c"
  "ae334e67-19ab-4af9-8f4b-79a9d1975030"
)

# Convert to JSON array
JSON_IDS=$(printf '%s\n' "${USER_IDS[@]}" | jq -R . | jq -s .)

echo "Sending request to batch-diagnose endpoint..."
echo ""

curl -X POST https://app.crispdigital.io/api/admin/users/batch-diagnose \
  -H "Content-Type: application/json" \
  -H "Cookie: $(cat ~/.crisp-session-cookie 2>/dev/null || echo '')" \
  -d "{\"user_ids\": $JSON_IDS}" \
  | jq '.'

echo ""
echo "Note: You need to be logged in as admin. If this fails, use the admin dashboard:"
echo "1. Go to /admin"
echo "2. Check 'Include users without profiles'"
echo "3. Search for each email address"
echo "4. Click on each user to see details"
