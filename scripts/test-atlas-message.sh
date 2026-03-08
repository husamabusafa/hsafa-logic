#!/bin/bash
# Test Atlas message flow — run after adding OpenAI credits
# Usage: ./scripts/test-atlas-message.sh [JWT] [ENTITY_ID]
#
# Get JWT from browser (localStorage or cookie) when logged in as Ahmad.
# Default uses Ahmad's entityId for the shared space.

set -e
SPACE_ID="eaa4b1d7-82f9-4c2b-9677-deca8b057bdc"
JWT="${1:-}"
ENTITY_ID="${2:-56010c80-416c-47be-943f-ea6c8ca5a9a5}"

if [ -z "$JWT" ]; then
  echo "Usage: $0 <JWT> [entityId]"
  echo "Get JWT from browser when logged in (e.g. Ahmad)."
  exit 1
fi

echo "Sending message to space $SPACE_ID..."
RES=$(curl -s -X POST "http://localhost:3005/api/smart-spaces/$SPACE_ID/messages" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -H "x-public-key: pk_spaces_dev_public_change_in_prod" \
  -d "{\"content\":\"hi atlas\",\"entityId\":\"$ENTITY_ID\"}")

MSG_ID=$(echo "$RES" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$MSG_ID" ]; then
  echo "Failed to send: $RES"
  exit 1
fi
echo "Message sent (id: $MSG_ID). Waiting 45s for Atlas..."
sleep 45

echo "Checking for Atlas response..."
psql "postgresql://hsafa:hsafa123@localhost:5434/use_case_db" -t -c "
  SELECT display_name, role, LEFT(content, 60) as content, seq, created_at
  FROM smart_space_messages m
  JOIN smart_spaces s ON s.id = m.smart_space_id
  JOIN entities e ON e.id = m.entity_id
  WHERE m.smart_space_id = '$SPACE_ID'
  ORDER BY m.seq DESC
  LIMIT 5;
"

echo ""
echo "If you see an 'Atlas' assistant message above, the test passed."
