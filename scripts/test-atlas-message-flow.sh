#!/bin/bash
# =============================================================================
# Test Atlas message flow — messages API → extension → Core inbox → Atlas responds
#
# Usage:
#   With JWT (from browser when logged in):
#     ./scripts/test-atlas-message-flow.sh <JWT> [entityId]
#
#   With x-secret-key (for CI/automated testing):
#     SPACES_SECRET_KEY=sk_spaces_dev_secret_change_in_prod ./scripts/test-atlas-message-flow.sh "" <entityId>
#
# Prerequisites: Core (3001), use-case-app (3005), DB, Redis running.
# Atlas must be connected to the space (ext-spaces bootstrap).
# =============================================================================

set -e

SPACE_ID="${SPACE_ID:-e46cc24f-bdb6-4ead-85ac-06f4b0d6997c}"
APP_URL="${APP_URL:-http://localhost:3005}"
ENTITY_ID="${2:-56010c80-416c-47be-943f-ea6c8ca5a9a5}"
CONTENT="${CONTENT:-hi}"
WAIT_SEC="${WAIT_SEC:-60}"
DB_URL="${DATABASE_URL:-postgresql://hsafa:hsafa123@localhost:5434/use_case_db}"

JWT="$1"

# Build auth headers
if [ -n "$JWT" ]; then
  AUTH_HEADERS=(-H "Authorization: Bearer $JWT" -H "x-public-key: pk_spaces_dev_public_change_in_prod")
  echo "Using JWT auth..."
elif [ -n "$SPACES_SECRET_KEY" ]; then
  AUTH_HEADERS=(-H "x-secret-key: $SPACES_SECRET_KEY")
  echo "Using x-secret-key auth..."
  if [ -z "$2" ]; then
    echo "Error: entityId required when using x-secret-key. Pass as second arg."
    exit 1
  fi
  ENTITY_ID="$2"
else
  echo "Usage: $0 <JWT> [entityId]"
  echo "   Or: SPACES_SECRET_KEY=sk_... $0 \"\" <entityId>"
  echo ""
  echo "Get JWT from browser when logged in (Application > Local Storage or cookie)."
  exit 1
fi

echo "Sending \"$CONTENT\" to space $SPACE_ID (entityId: $ENTITY_ID)..."
RES=$(curl -s -X POST "$APP_URL/api/smart-spaces/$SPACE_ID/messages" \
  "${AUTH_HEADERS[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"content\":\"$CONTENT\",\"entityId\":\"$ENTITY_ID\"}")

if echo "$RES" | grep -q '"error"'; then
  echo "Failed to send message: $RES"
  exit 1
fi

MSG_ID=$(echo "$RES" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$MSG_ID" ]; then
  echo "Failed to parse response: $RES"
  exit 1
fi

echo "Message sent (id: $MSG_ID). Polling for Atlas (max ${WAIT_SEC}s)..."
POLL_INTERVAL=3
elapsed=0
while [ $elapsed -lt "$WAIT_SEC" ]; do
  sleep $POLL_INTERVAL
  elapsed=$((elapsed + POLL_INTERVAL))
  printf "  %ds... " "$elapsed"
  PSQL_OUT=$(psql "$DB_URL" -t -c "
  SELECT e.display_name, m.role, LEFT(m.content, 80) as content
  FROM smart_space_messages m
  JOIN entities e ON e.id = m.entity_id
  WHERE m.smart_space_id = '$SPACE_ID'
  ORDER BY m.seq DESC
  LIMIT 6;
" 2>/dev/null || echo "DB_ERROR")
  if echo "$PSQL_OUT" | grep -qi "atlas"; then
    echo ""
    echo "$PSQL_OUT"
    echo ""
    echo "✅ PASS: Atlas responded in the space."
    exit 0
  fi
  echo "no Atlas yet"
done
echo ""

echo "Checking final state..."
PSQL_OUT=$(psql "$DB_URL" -t -c "
  SELECT e.display_name, m.role, LEFT(m.content, 80) as content, m.seq, m.created_at
  FROM smart_space_messages m
  JOIN entities e ON e.id = m.entity_id
  WHERE m.smart_space_id = '$SPACE_ID'
  ORDER BY m.seq DESC
  LIMIT 6;
" 2>/dev/null || echo "DB_ERROR")

if echo "$PSQL_OUT" | grep -q "DB_ERROR"; then
  echo "Could not query DB. Is PostgreSQL running? DATABASE_URL=$DB_URL"
  exit 1
fi

echo "$PSQL_OUT"

if echo "$PSQL_OUT" | grep -qi "atlas"; then
  echo ""
  echo "✅ PASS: Atlas responded in the space."
  exit 0
else
  echo ""
  echo "❌ FAIL: No Atlas response after ${WAIT_SEC}s."
  echo "  - Is Core running on 3001?"
  echo "  - Is use-case-app running on 3005?"
  echo "  - Is Atlas connected to this space? (ext-spaces bootstrap)"
  echo "  - Check Core logs for cycle errors."
  exit 1
fi
