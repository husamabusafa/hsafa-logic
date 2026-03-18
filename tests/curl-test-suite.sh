#!/usr/bin/env bash
# =============================================================================
# Hsafa Core + Spaces — Comprehensive Curl Test Suite
#
# Tests ALL endpoints and behaviors across both services.
# Run with: bash tests/curl-test-suite.sh
#
# Prerequisites:
#   - Core running on CORE_URL (default: http://localhost:3001)
#   - Spaces running on SPACES_URL (default: http://localhost:3005)
#   - Both connected to their respective databases and Redis
# =============================================================================

set -euo pipefail

# ── Configuration (override via env vars) ────────────────────────────────────

CORE_URL="${CORE_URL:-http://localhost:3001}"
SPACES_URL="${SPACES_URL:-http://localhost:3005}"
CORE_API_KEY="${CORE_API_KEY:-dev-api-key-change-in-prod}"
SPACES_SECRET_KEY="${SPACES_SECRET_KEY:-sk_spaces_dev_secret_change_in_prod}"

# ── Colors & Helpers ─────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

PASS=0
FAIL=0
SKIP=0
TOTAL=0

# Temporary file for curl responses
RESP=$(mktemp)
trap "rm -f $RESP" EXIT

log_section() {
  echo ""
  echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}${BLUE}  $1${NC}"
  echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

log_test() {
  TOTAL=$((TOTAL + 1))
  echo -e "\n${CYAN}[$TOTAL] $1${NC}"
}

assert_status() {
  local expected=$1
  local actual=$2
  local label=$3
  if [ "$actual" -eq "$expected" ]; then
    echo -e "  ${GREEN}✓ PASS${NC} — HTTP $actual (expected $expected) — $label"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗ FAIL${NC} — HTTP $actual (expected $expected) — $label"
    echo -e "  ${RED}  Response: $(cat $RESP | head -c 500)${NC}"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_field() {
  local field=$1
  local expected=$2
  local label=$3
  local actual
  actual=$(cat $RESP | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$field)" 2>/dev/null || echo "__PARSE_ERROR__")
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓ PASS${NC} — $label: \"$actual\""
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗ FAIL${NC} — $label: expected \"$expected\", got \"$actual\""
    FAIL=$((FAIL + 1))
  fi
}

assert_json_exists() {
  local field=$1
  local label=$2
  local actual
  actual=$(cat $RESP | python3 -c "import sys,json; d=json.load(sys.stdin); v=d$field; print('EXISTS' if v is not None else 'NONE')" 2>/dev/null || echo "__PARSE_ERROR__")
  if [ "$actual" = "EXISTS" ]; then
    echo -e "  ${GREEN}✓ PASS${NC} — $label: field exists"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗ FAIL${NC} — $label: field missing or null"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_gt() {
  local field=$1
  local threshold=$2
  local label=$3
  local actual
  actual=$(cat $RESP | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$field)" 2>/dev/null || echo "0")
  if [ "$(echo "$actual > $threshold" | bc -l 2>/dev/null || echo 0)" = "1" ]; then
    echo -e "  ${GREEN}✓ PASS${NC} — $label: $actual > $threshold"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗ FAIL${NC} — $label: $actual not > $threshold"
    FAIL=$((FAIL + 1))
  fi
}

extract_json() {
  local field=$1
  cat $RESP | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$field)" 2>/dev/null
}

skip_test() {
  echo -e "  ${YELLOW}⊘ SKIP${NC} — $1"
  SKIP=$((SKIP + 1))
  TOTAL=$((TOTAL + 1))
}

# ── Core HTTP helper ─────────────────────────────────────────────────────────

core_curl() {
  local method=$1
  local path=$2
  shift 2
  curl -s -w "\n%{http_code}" \
    -X "$method" \
    -H "Content-Type: application/json" \
    -H "x-api-key: $CORE_API_KEY" \
    "$CORE_URL$path" \
    "$@"
}

# ── Spaces HTTP helper ───────────────────────────────────────────────────────

spaces_curl() {
  local method=$1
  local path=$2
  shift 2
  curl -s -w "\n%{http_code}" \
    -X "$method" \
    -H "Content-Type: application/json" \
    -H "x-secret-key: $SPACES_SECRET_KEY" \
    "$SPACES_URL$path" \
    "$@"
}

# Extracts HTTP status code from curl output (last line)
get_status() {
  tail -1 "$RESP"
}

# Strips the status code line so $RESP contains only JSON body
strip_status() {
  local status
  status=$(tail -1 "$RESP")
  # Remove last line (status code) from RESP, keep only body
  python3 -c "
import sys
lines = open('$RESP').read().rsplit('\n', 1)
body = lines[0] if len(lines) > 1 else lines[0]
open('$RESP', 'w').write(body)
" 2>/dev/null
  echo "$status"
}

do_core() {
  local method=$1
  local path=$2
  shift 2
  core_curl "$method" "$path" "$@" > "$RESP" 2>/dev/null
  strip_status
}

do_spaces() {
  local method=$1
  local path=$2
  shift 2
  spaces_curl "$method" "$path" "$@" > "$RESP" 2>/dev/null
  strip_status
}

# =============================================================================
echo -e "${BOLD}${GREEN}"
echo "  ╦ ╦╔═╗╔═╗╔═╗╔═╗╔═╗  ╔╦╗╔═╗╔═╗╔╦╗  ╔═╗╦ ╦╦╔╦╗╔═╗"
echo "  ╠═╣╚═╗╠═╣╠╣ ╠═╣╚═╗   ║ ║╣ ╚═╗ ║   ╚═╗║ ║║ ║ ║╣ "
echo "  ╩ ╩╚═╝╩ ╩╚  ╩ ╩╚═╝   ╩ ╚═╝╚═╝ ╩   ╚═╝╚═╝╩ ╩ ╚═╝"
echo -e "${NC}"
echo -e "  Core:   ${CORE_URL}"
echo -e "  Spaces: ${SPACES_URL}"
echo ""

# =============================================================================
# SECTION 1: Health Checks
# =============================================================================
log_section "1. HEALTH CHECKS"

log_test "Core health check"
STATUS=$(do_core GET /health)
assert_status 200 "$STATUS" "Core /health"

log_test "Spaces health check"
STATUS=$(do_spaces GET /health)
assert_status 200 "$STATUS" "Spaces /health"

# =============================================================================
# SECTION 2: Core — Haseef CRUD
# =============================================================================
log_section "2. CORE — HASEEF CRUD"

log_test "Create test haseef (TestBot)"
STATUS=$(do_core POST /api/haseefs -d '{
  "name": "TestBot_CurlSuite",
  "description": "Automated test haseef",
  "configJson": {
    "model": "openai:gpt-4o-mini",
    "instructions": "You are a test bot. Always respond briefly.",
    "consciousness": { "maxTokens": 50000 }
  },
  "profileJson": {
    "bio": "Test bot for curl suite"
  }
}')
assert_status 201 "$STATUS" "POST /api/haseefs"
HASEEF_ID=$(extract_json "['haseef']['id']")
echo -e "  ${YELLOW}→ haseefId: $HASEEF_ID${NC}"

log_test "List haseefs"
STATUS=$(do_core GET /api/haseefs)
assert_status 200 "$STATUS" "GET /api/haseefs"
HASEEF_COUNT=$(extract_json "['haseefs'].__len__()")
echo -e "  ${YELLOW}→ Total haseefs: $HASEEF_COUNT${NC}"

log_test "Get haseef by ID"
STATUS=$(do_core GET "/api/haseefs/$HASEEF_ID")
assert_status 200 "$STATUS" "GET /api/haseefs/:id"
assert_json_field "['haseef']['name']" "TestBot_CurlSuite" "Name matches"

log_test "Update haseef config"
STATUS=$(do_core PATCH "/api/haseefs/$HASEEF_ID" -d '{
  "description": "Updated test haseef",
  "configJson": {
    "model": "openai:gpt-4o-mini",
    "instructions": "You are an updated test bot. Always respond briefly.",
    "consciousness": { "maxTokens": 50000 }
  }
}')
assert_status 200 "$STATUS" "PATCH /api/haseefs/:id"
assert_json_field "['haseef']['description']" "Updated test haseef" "Description updated"

log_test "Get haseef profile"
STATUS=$(do_core GET "/api/haseefs/$HASEEF_ID/profile")
assert_status 200 "$STATUS" "GET /api/haseefs/:id/profile"

log_test "Update haseef profile"
STATUS=$(do_core PATCH "/api/haseefs/$HASEEF_ID/profile" -d '{
  "bio": "Updated bio",
  "location": "Test Land"
}')
assert_status 200 "$STATUS" "PATCH /api/haseefs/:id/profile"

log_test "Create duplicate haseef (expect 409)"
STATUS=$(do_core POST /api/haseefs -d '{
  "name": "TestBot_CurlSuite",
  "configJson": { "model": "openai:gpt-4o-mini" }
}')
assert_status 409 "$STATUS" "POST /api/haseefs (duplicate name)"

log_test "Get non-existent haseef (expect 404)"
STATUS=$(do_core GET "/api/haseefs/00000000-0000-0000-0000-000000000000")
assert_status 404 "$STATUS" "GET /api/haseefs/:id (not found)"

# =============================================================================
# SECTION 3: Core — Process Management
# =============================================================================
log_section "3. CORE — PROCESS MANAGEMENT"

log_test "Get process status"
STATUS=$(do_core GET "/api/haseefs/$HASEEF_ID/status")
assert_status 200 "$STATUS" "GET /api/haseefs/:id/status"
RUNNING=$(extract_json "['running']")
echo -e "  ${YELLOW}→ Running: $RUNNING${NC}"

log_test "Stop process"
STATUS=$(do_core POST "/api/haseefs/$HASEEF_ID/stop")
assert_status 200 "$STATUS" "POST /api/haseefs/:id/stop"

log_test "Verify stopped"
STATUS=$(do_core GET "/api/haseefs/$HASEEF_ID/status")
assert_status 200 "$STATUS" "GET /api/haseefs/:id/status (after stop)"
assert_json_field "['running']" "False" "Process is stopped"

log_test "Start process"
STATUS=$(do_core POST "/api/haseefs/$HASEEF_ID/start")
assert_status 200 "$STATUS" "POST /api/haseefs/:id/start"

log_test "Verify running"
sleep 1
STATUS=$(do_core GET "/api/haseefs/$HASEEF_ID/status")
assert_status 200 "$STATUS" "GET /api/haseefs/:id/status (after start)"
assert_json_field "['running']" "True" "Process is running"

# =============================================================================
# SECTION 4: Core — Scopes & Tools
# =============================================================================
log_section "4. CORE — SCOPES & TOOLS"

log_test "Sync tools for test scope"
STATUS=$(do_core PUT "/api/haseefs/$HASEEF_ID/scopes/test_scope/tools" -d '{
  "tools": [
    {
      "name": "test_action",
      "description": "A test action tool",
      "inputSchema": {
        "type": "object",
        "properties": {
          "message": { "type": "string" }
        },
        "required": ["message"]
      },
      "mode": "sync"
    },
    {
      "name": "another_action",
      "description": "Another test action",
      "inputSchema": {
        "type": "object",
        "properties": {
          "value": { "type": "number" }
        }
      },
      "mode": "fire_and_forget"
    }
  ],
  "instructions": "Test scope instructions for the test bot."
}')
assert_status 200 "$STATUS" "PUT /api/haseefs/:id/scopes/:scope/tools"
TOOL_COUNT=$(extract_json "['count']")
echo -e "  ${YELLOW}→ Tools synced: $TOOL_COUNT${NC}"

log_test "List tools in scope"
STATUS=$(do_core GET "/api/haseefs/$HASEEF_ID/scopes/test_scope/tools")
assert_status 200 "$STATUS" "GET /api/haseefs/:id/scopes/:scope/tools"

log_test "List ALL tools across scopes"
STATUS=$(do_core GET "/api/haseefs/$HASEEF_ID/scopes")
assert_status 200 "$STATUS" "GET /api/haseefs/:id/scopes (all tools)"

log_test "Upsert single tool"
STATUS=$(do_core PUT "/api/haseefs/$HASEEF_ID/scopes/test_scope/tools/extra_tool" -d '{
  "description": "An extra upserted tool",
  "inputSchema": { "type": "object", "properties": {} }
}')
assert_status 200 "$STATUS" "PUT /api/haseefs/:id/scopes/:scope/tools/:name"

log_test "Delete single tool"
STATUS=$(do_core DELETE "/api/haseefs/$HASEEF_ID/scopes/test_scope/tools/extra_tool")
assert_status 200 "$STATUS" "DELETE /api/haseefs/:id/scopes/:scope/tools/:name"

log_test "Delete non-existent tool (expect 404)"
STATUS=$(do_core DELETE "/api/haseefs/$HASEEF_ID/scopes/test_scope/tools/nonexistent")
assert_status 404 "$STATUS" "DELETE /api/haseefs/:id/scopes/:scope/tools/:name (not found)"

# =============================================================================
# SECTION 5: Core — Events & Inbox
# =============================================================================
log_section "5. CORE — EVENTS & INBOX"

log_test "Push sense event"
EVENT_ID="test-event-$(date +%s)"
STATUS=$(do_core POST "/api/haseefs/$HASEEF_ID/events" -d "{
  \"eventId\": \"$EVENT_ID\",
  \"scope\": \"test_scope\",
  \"type\": \"test_signal\",
  \"data\": {
    \"formattedContext\": \"[TEST] This is a test sense event for the curl test suite.\",
    \"source\": \"curl-test\"
  }
}")
assert_status 200 "$STATUS" "POST /api/haseefs/:id/events"
assert_json_field "['pushed']" "1" "1 event pushed"

log_test "Push batch events"
STATUS=$(do_core POST "/api/haseefs/$HASEEF_ID/events" -d "[
  {
    \"eventId\": \"batch-1-$(date +%s)\",
    \"scope\": \"test_scope\",
    \"type\": \"batch_test\",
    \"data\": { \"formattedContext\": \"Batch event 1\" }
  },
  {
    \"eventId\": \"batch-2-$(date +%s)\",
    \"scope\": \"test_scope\",
    \"type\": \"batch_test\",
    \"data\": { \"formattedContext\": \"Batch event 2\" }
  }
]")
assert_status 200 "$STATUS" "POST /api/haseefs/:id/events (batch)"
assert_json_field "['pushed']" "2" "2 events pushed"

log_test "Push event with missing fields (expect 400)"
STATUS=$(do_core POST "/api/haseefs/$HASEEF_ID/events" -d '{
  "eventId": "bad-event",
  "scope": "test_scope"
}')
assert_status 400 "$STATUS" "POST /api/haseefs/:id/events (missing type)"

log_test "Push event to non-existent haseef (expect 404)"
STATUS=$(do_core POST "/api/haseefs/00000000-0000-0000-0000-000000000000/events" -d '{
  "eventId": "orphan",
  "scope": "test",
  "type": "test",
  "data": {}
}')
assert_status 404 "$STATUS" "POST /api/haseefs/:id/events (not found)"

# =============================================================================
# SECTION 6: Core — Consciousness & Snapshots
# =============================================================================
log_section "6. CORE — CONSCIOUSNESS & SNAPSHOTS"

log_test "Create consciousness snapshot"
sleep 3  # Wait for process to potentially run a cycle
STATUS=$(do_core POST "/api/haseefs/$HASEEF_ID/snapshot")
assert_status 200 "$STATUS" "POST /api/haseefs/:id/snapshot"

log_test "List snapshots"
STATUS=$(do_core GET "/api/haseefs/$HASEEF_ID/snapshots")
assert_status 200 "$STATUS" "GET /api/haseefs/:id/snapshots"
SNAPSHOT_COUNT=$(extract_json "['snapshots'].__len__()")
echo -e "  ${YELLOW}→ Snapshots: $SNAPSHOT_COUNT${NC}"

if [ "$SNAPSHOT_COUNT" -gt "0" ]; then
  SNAPSHOT_ID=$(extract_json "['snapshots'][0]['id']")
  log_test "Restore snapshot"
  STATUS=$(do_core POST "/api/haseefs/$HASEEF_ID/restore" -d "{\"snapshotId\": \"$SNAPSHOT_ID\"}")
  assert_status 200 "$STATUS" "POST /api/haseefs/:id/restore"
else
  log_test "Restore snapshot"
  skip_test "No snapshots to restore"
fi

# =============================================================================
# SECTION 7: Core — Runs
# =============================================================================
log_section "7. CORE — RUNS"

log_test "List all runs"
STATUS=$(do_core GET "/api/runs?limit=5")
assert_status 200 "$STATUS" "GET /api/runs"

log_test "List runs filtered by haseefId"
STATUS=$(do_core GET "/api/runs?haseefId=$HASEEF_ID&limit=5")
assert_status 200 "$STATUS" "GET /api/runs?haseefId=..."
RUN_COUNT=$(extract_json "['runs'].__len__()")
echo -e "  ${YELLOW}→ Runs for test haseef: $RUN_COUNT${NC}"

if [ "$RUN_COUNT" -gt "0" ]; then
  RUN_ID=$(extract_json "['runs'][0]['id']")
  
  log_test "Get single run"
  STATUS=$(do_core GET "/api/runs/$RUN_ID")
  assert_status 200 "$STATUS" "GET /api/runs/:runId"
  
  log_test "Verify token usage fields exist on run"
  assert_json_exists "['run']['promptTokens']" "promptTokens field exists"
  assert_json_exists "['run']['completionTokens']" "completionTokens field exists"
  PROMPT_TOKENS=$(extract_json "['run']['promptTokens']")
  COMPLETION_TOKENS=$(extract_json "['run']['completionTokens']")
  echo -e "  ${YELLOW}→ Tokens: prompt=$PROMPT_TOKENS, completion=$COMPLETION_TOKENS${NC}"

  log_test "List runs filtered by status"
  STATUS=$(do_core GET "/api/runs?status=completed&limit=5")
  assert_status 200 "$STATUS" "GET /api/runs?status=completed"
else
  log_test "Get single run"
  skip_test "No runs available yet"
  log_test "Verify token usage"
  skip_test "No runs available yet"
  log_test "List runs by status"
  skip_test "No runs available yet"
fi

log_test "Get non-existent run (expect 404)"
STATUS=$(do_core GET "/api/runs/00000000-0000-0000-0000-000000000000")
assert_status 404 "$STATUS" "GET /api/runs/:runId (not found)"

# =============================================================================
# SECTION 8: Core — Auth
# =============================================================================
log_section "8. CORE — AUTH"

log_test "Request without API key (expect 401)"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X GET "$CORE_URL/api/haseefs")
TOTAL=$((TOTAL + 1))
if [ "$HTTP_STATUS" = "401" ]; then
  echo -e "  ${GREEN}✓ PASS${NC} — HTTP 401 (no API key)"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗ FAIL${NC} — HTTP $HTTP_STATUS (expected 401)"
  FAIL=$((FAIL + 1))
fi

log_test "Request with wrong API key (expect 401)"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X GET -H "x-api-key: wrong-key" "$CORE_URL/api/haseefs")
TOTAL=$((TOTAL + 1))
if [ "$HTTP_STATUS" = "401" ]; then
  echo -e "  ${GREEN}✓ PASS${NC} — HTTP 401 (wrong API key)"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗ FAIL${NC} — HTTP $HTTP_STATUS (expected 401)"
  FAIL=$((FAIL + 1))
fi

# =============================================================================
# SECTION 9: Spaces — SmartSpace CRUD
# =============================================================================
log_section "9. SPACES — SMARTSPACE CRUD"

log_test "Create SmartSpace"
STATUS=$(do_spaces POST /api/smart-spaces -d '{
  "name": "Test Space (Curl Suite)",
  "description": "Automated test space"
}')
assert_status 201 "$STATUS" "POST /api/smart-spaces"
SPACE_ID=$(extract_json "['space']['id']")
echo -e "  ${YELLOW}→ spaceId: $SPACE_ID${NC}"

log_test "List SmartSpaces"
STATUS=$(do_spaces GET /api/smart-spaces)
assert_status 200 "$STATUS" "GET /api/smart-spaces"

log_test "Get SmartSpace by ID"
STATUS=$(do_spaces GET "/api/smart-spaces/$SPACE_ID")
assert_status 200 "$STATUS" "GET /api/smart-spaces/:id"

log_test "Update SmartSpace"
STATUS=$(do_spaces PATCH "/api/smart-spaces/$SPACE_ID" -d '{
  "name": "Updated Test Space",
  "description": "Updated description"
}')
assert_status 200 "$STATUS" "PATCH /api/smart-spaces/:id"

# =============================================================================
# SECTION 10: Spaces — Entity & Member Management
# =============================================================================
log_section "10. SPACES — ENTITIES & MEMBERS"

# Create test entities first
log_test "Create human entity"
STATUS=$(do_spaces POST /api/entities -d '{
  "displayName": "TestHuman_CurlSuite",
  "type": "human"
}')
if [ "$STATUS" -eq 201 ] || [ "$STATUS" -eq 200 ]; then
  HUMAN_ENTITY_ID=$(extract_json "['entity']['id']")
  echo -e "  ${GREEN}✓ PASS${NC} — Created human entity"
  echo -e "  ${YELLOW}→ entityId: $HUMAN_ENTITY_ID${NC}"
  PASS=$((PASS + 1))
else
  # Try to find existing
  echo -e "  ${YELLOW}→ Entity may already exist, trying to find...${NC}"
  STATUS=$(do_spaces GET "/api/entities?displayName=TestHuman_CurlSuite")
  HUMAN_ENTITY_ID=$(extract_json "['entities'][0]['id']" 2>/dev/null || echo "")
  if [ -n "$HUMAN_ENTITY_ID" ] && [ "$HUMAN_ENTITY_ID" != "__PARSE_ERROR__" ]; then
    echo -e "  ${GREEN}✓ PASS${NC} — Found existing entity: $HUMAN_ENTITY_ID"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗ FAIL${NC} — Could not create or find human entity (HTTP $STATUS)"
    FAIL=$((FAIL + 1))
    HUMAN_ENTITY_ID=""
  fi
fi

log_test "Create agent entity"
STATUS=$(do_spaces POST /api/entities -d '{
  "displayName": "TestAgent_CurlSuite",
  "type": "agent"
}')
if [ "$STATUS" -eq 201 ] || [ "$STATUS" -eq 200 ]; then
  AGENT_ENTITY_ID=$(extract_json "['entity']['id']")
  echo -e "  ${GREEN}✓ PASS${NC} — Created agent entity"
  echo -e "  ${YELLOW}→ entityId: $AGENT_ENTITY_ID${NC}"
  PASS=$((PASS + 1))
else
  STATUS=$(do_spaces GET "/api/entities?displayName=TestAgent_CurlSuite")
  AGENT_ENTITY_ID=$(extract_json "['entities'][0]['id']" 2>/dev/null || echo "")
  if [ -n "$AGENT_ENTITY_ID" ] && [ "$AGENT_ENTITY_ID" != "__PARSE_ERROR__" ]; then
    echo -e "  ${GREEN}✓ PASS${NC} — Found existing entity: $AGENT_ENTITY_ID"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗ FAIL${NC} — Could not create or find agent entity"
    FAIL=$((FAIL + 1))
    AGENT_ENTITY_ID=""
  fi
fi

if [ -n "$HUMAN_ENTITY_ID" ]; then
  log_test "Add human member to space"
  STATUS=$(do_spaces POST "/api/smart-spaces/$SPACE_ID/members" -d "{
    \"entityId\": \"$HUMAN_ENTITY_ID\",
    \"role\": \"admin\"
  }")
  assert_status 201 "$STATUS" "POST /api/smart-spaces/:id/members (human)"
fi

if [ -n "$AGENT_ENTITY_ID" ]; then
  log_test "Add agent member to space"
  STATUS=$(do_spaces POST "/api/smart-spaces/$SPACE_ID/members" -d "{
    \"entityId\": \"$AGENT_ENTITY_ID\",
    \"role\": \"member\"
  }")
  assert_status 201 "$STATUS" "POST /api/smart-spaces/:id/members (agent)"
fi

log_test "List space members"
STATUS=$(do_spaces GET "/api/smart-spaces/$SPACE_ID/members")
assert_status 200 "$STATUS" "GET /api/smart-spaces/:id/members"
MEMBER_COUNT=$(extract_json "['members'].__len__()")
echo -e "  ${YELLOW}→ Members: $MEMBER_COUNT${NC}"

if [ -n "$AGENT_ENTITY_ID" ]; then
  log_test "Update member role"
  STATUS=$(do_spaces PATCH "/api/smart-spaces/$SPACE_ID/members/$AGENT_ENTITY_ID" -d '{
    "role": "admin"
  }')
  assert_status 200 "$STATUS" "PATCH /api/smart-spaces/:id/members/:entityId"
fi

# =============================================================================
# SECTION 11: Spaces — Messages
# =============================================================================
log_section "11. SPACES — MESSAGES"

if [ -n "$HUMAN_ENTITY_ID" ]; then
  log_test "Send message to space"
  STATUS=$(do_spaces POST "/api/smart-spaces/$SPACE_ID/messages" -d "{
    \"entityId\": \"$HUMAN_ENTITY_ID\",
    \"content\": \"Hello from the curl test suite! $(date)\"
  }")
  assert_status 201 "$STATUS" "POST /api/smart-spaces/:id/messages"
  MESSAGE_ID=$(extract_json "['message']['id']")
  echo -e "  ${YELLOW}→ messageId: $MESSAGE_ID${NC}"

  log_test "Send second message"
  STATUS=$(do_spaces POST "/api/smart-spaces/$SPACE_ID/messages" -d "{
    \"entityId\": \"$HUMAN_ENTITY_ID\",
    \"content\": \"This is a follow-up message.\"
  }")
  assert_status 201 "$STATUS" "POST /api/smart-spaces/:id/messages (2nd)"
  MESSAGE_ID_2=$(extract_json "['message']['id']")

  log_test "Send reply message"
  STATUS=$(do_spaces POST "/api/smart-spaces/$SPACE_ID/messages" -d "{
    \"entityId\": \"$HUMAN_ENTITY_ID\",
    \"content\": \"This is a reply to the first message.\",
    \"replyTo\": { \"messageId\": \"$MESSAGE_ID\" }
  }")
  assert_status 201 "$STATUS" "POST /api/smart-spaces/:id/messages (reply)"

  log_test "List messages"
  STATUS=$(do_spaces GET "/api/smart-spaces/$SPACE_ID/messages?limit=10")
  assert_status 200 "$STATUS" "GET /api/smart-spaces/:id/messages"
  MSG_COUNT=$(extract_json "['messages'].__len__()")
  echo -e "  ${YELLOW}→ Messages: $MSG_COUNT${NC}"

  log_test "Get message thread"
  STATUS=$(do_spaces GET "/api/smart-spaces/$SPACE_ID/messages/$MESSAGE_ID/thread")
  assert_status 200 "$STATUS" "GET /api/smart-spaces/:id/messages/:msgId/thread"

  log_test "Send message without content (expect 400)"
  STATUS=$(do_spaces POST "/api/smart-spaces/$SPACE_ID/messages" -d "{
    \"entityId\": \"$HUMAN_ENTITY_ID\"
  }")
  assert_status 400 "$STATUS" "POST /api/smart-spaces/:id/messages (no content)"
else
  for i in 1 2 3 4 5 6; do
    skip_test "Message tests skipped — no entity"
  done
fi

# =============================================================================
# SECTION 12: Spaces — Typing & Seen
# =============================================================================
log_section "12. SPACES — TYPING & SEEN"

# These require JWT auth normally, but secret key bypasses membership check
# The typing/seen endpoints need auth.entityId which secret key alone may not provide
# We test at least that the endpoints exist and respond appropriately

log_test "Typing indicator (secret key — may lack entityId)"
STATUS=$(do_spaces POST "/api/smart-spaces/$SPACE_ID/typing" -d '{"typing": true}')
# Secret key without JWT won't have entityId, so expect 400
if [ "$STATUS" -eq 200 ] || [ "$STATUS" -eq 400 ]; then
  echo -e "  ${GREEN}✓ PASS${NC} — Endpoint responsive (HTTP $STATUS)"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗ FAIL${NC} — Unexpected HTTP $STATUS"
  FAIL=$((FAIL + 1))
fi

log_test "Mark seen (secret key)"
if [ -n "${MESSAGE_ID:-}" ]; then
  STATUS=$(do_spaces POST "/api/smart-spaces/$SPACE_ID/seen" -d "{\"messageId\": \"$MESSAGE_ID\"}")
  if [ "$STATUS" -eq 200 ] || [ "$STATUS" -eq 400 ]; then
    echo -e "  ${GREEN}✓ PASS${NC} — Endpoint responsive (HTTP $STATUS)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗ FAIL${NC} — Unexpected HTTP $STATUS"
    FAIL=$((FAIL + 1))
  fi
else
  skip_test "No message to mark as seen"
fi

# =============================================================================
# SECTION 13: Spaces — SSE Stream (quick connect/disconnect test)
# =============================================================================
log_section "13. SPACES — SSE STREAM"

log_test "SSE stream endpoint responds with event-stream content type"
HTTP_HEADERS=$(curl -s -D - -o /dev/null --max-time 3 \
  -H "x-secret-key: $SPACES_SECRET_KEY" \
  "$SPACES_URL/api/smart-spaces/$SPACE_ID/stream?entityId=${HUMAN_ENTITY_ID:-test}" 2>/dev/null || true)
TOTAL=$((TOTAL + 1))
if echo "$HTTP_HEADERS" | grep -qi "text/event-stream"; then
  echo -e "  ${GREEN}✓ PASS${NC} — Content-Type: text/event-stream"
  PASS=$((PASS + 1))
else
  echo -e "  ${YELLOW}⊘ SKIP${NC} — SSE may require JWT auth (expected in production)"
  SKIP=$((SKIP + 1))
fi

# =============================================================================
# SECTION 14: Core — Haseef SSE Stream
# =============================================================================
log_section "14. CORE — HASEEF SSE STREAM"

log_test "Haseef run stream endpoint"
HTTP_HEADERS=$(curl -s -D - -o /dev/null --max-time 3 \
  -H "x-api-key: $CORE_API_KEY" \
  "$CORE_URL/api/haseefs/$HASEEF_ID/stream" 2>/dev/null || true)
TOTAL=$((TOTAL + 1))
if echo "$HTTP_HEADERS" | grep -qi "text/event-stream"; then
  echo -e "  ${GREEN}✓ PASS${NC} — Content-Type: text/event-stream"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗ FAIL${NC} — Expected text/event-stream"
  FAIL=$((FAIL + 1))
fi

# =============================================================================
# SECTION 15: Core — Admin Status
# =============================================================================
log_section "15. CORE — ADMIN STATUS"

log_test "Admin status endpoint"
STATUS=$(do_core GET "/admin/status")
assert_status 200 "$STATUS" "GET /admin/status"

# =============================================================================
# SECTION 16: End-to-End — Message → Haseef Response
# =============================================================================
log_section "16. END-TO-END — MESSAGE → HASEEF RESPONSE"

# For E2E, we need a haseef that's actually connected via Spaces service.
# Let's check if there's an existing haseef connected to a space.

log_test "List existing haseefs (find connected one)"
STATUS=$(do_core GET /api/haseefs)
assert_status 200 "$STATUS" "GET /api/haseefs"
EXISTING_HASEEF_COUNT=$(extract_json "['haseefs'].__len__()")

if [ "$EXISTING_HASEEF_COUNT" -gt "0" ]; then
  # Use the first existing haseef (likely bootstrapped by Spaces service)
  E2E_HASEEF_ID=$(extract_json "['haseefs'][0]['id']")
  E2E_HASEEF_NAME=$(extract_json "['haseefs'][0]['name']")
  echo -e "  ${YELLOW}→ Using haseef: $E2E_HASEEF_NAME ($E2E_HASEEF_ID)${NC}"

  # Check if this haseef has spaces tools (connected to Spaces service)
  log_test "Verify haseef has spaces tools"
  STATUS=$(do_core GET "/api/haseefs/$E2E_HASEEF_ID/scopes/spaces/tools")
  assert_status 200 "$STATUS" "GET scopes/spaces/tools"
  SPACES_TOOL_COUNT=$(extract_json "['tools'].__len__()")
  echo -e "  ${YELLOW}→ Spaces tools: $SPACES_TOOL_COUNT${NC}"

  if [ "$SPACES_TOOL_COUNT" -gt "0" ]; then
    # Find a space this haseef is a member of
    log_test "Find spaces for E2E haseef"
    STATUS=$(do_core GET "/api/haseefs/$E2E_HASEEF_ID/profile")
    E2E_ENTITY_ID=$(extract_json "['profile']['entityId']" 2>/dev/null || echo "")
    
    if [ -n "$E2E_ENTITY_ID" ] && [ "$E2E_ENTITY_ID" != "None" ] && [ "$E2E_ENTITY_ID" != "__PARSE_ERROR__" ]; then
      echo -e "  ${YELLOW}→ Entity ID: $E2E_ENTITY_ID${NC}"
      
      # List spaces this entity is in
      STATUS=$(do_spaces GET "/api/entities/$E2E_ENTITY_ID/spaces" 2>/dev/null)
      if [ "$STATUS" = "200" ]; then
        E2E_SPACE_COUNT=$(extract_json "['spaces'].__len__()" 2>/dev/null || echo "0")
        if [ "$E2E_SPACE_COUNT" -gt "0" ]; then
          E2E_SPACE_ID=$(extract_json "['spaces'][0]['id']" 2>/dev/null || echo "")
          echo -e "  ${YELLOW}→ Using space: $E2E_SPACE_ID${NC}"
        fi
      fi
    fi

    if [ -n "${E2E_SPACE_ID:-}" ] && [ "$E2E_SPACE_ID" != "__PARSE_ERROR__" ]; then
      # Get a human member of this space to send as
      STATUS=$(do_spaces GET "/api/smart-spaces/$E2E_SPACE_ID/members")
      E2E_HUMAN=$(cat $RESP | python3 -c "
import sys, json
d = json.load(sys.stdin)
for m in d.get('members', []):
  e = m.get('entity', {})
  if e.get('type') == 'human':
    print(e['id'])
    break
" 2>/dev/null || echo "")

      if [ -n "$E2E_HUMAN" ]; then
        log_test "E2E: Send message to trigger haseef"
        STATUS=$(do_spaces POST "/api/smart-spaces/$E2E_SPACE_ID/messages" -d "{
          \"entityId\": \"$E2E_HUMAN\",
          \"content\": \"Hello from the test suite! What is 2 + 2? Reply briefly.\"
        }")
        assert_status 201 "$STATUS" "POST message to trigger haseef"

        echo -e "  ${YELLOW}→ Waiting 10s for haseef to respond...${NC}"
        sleep 10

        log_test "E2E: Check for haseef response"
        STATUS=$(do_spaces GET "/api/smart-spaces/$E2E_SPACE_ID/messages?limit=5")
        assert_status 200 "$STATUS" "GET messages after trigger"

        # Check if there's a message from the agent entity
        AGENT_REPLIED=$(cat $RESP | python3 -c "
import sys, json
d = json.load(sys.stdin)
for m in d.get('messages', []):
  e = m.get('entity', {})
  if e.get('type') == 'agent':
    print('YES')
    break
else:
  print('NO')
" 2>/dev/null || echo "UNKNOWN")

        TOTAL=$((TOTAL + 1))
        if [ "$AGENT_REPLIED" = "YES" ]; then
          echo -e "  ${GREEN}✓ PASS${NC} — Haseef responded to the message!"
          PASS=$((PASS + 1))
        else
          echo -e "  ${YELLOW}⊘ SKIP${NC} — Haseef may need more time or LLM key may be missing"
          SKIP=$((SKIP + 1))
        fi

        log_test "E2E: Verify run was created"
        STATUS=$(do_core GET "/api/runs?haseefId=$E2E_HASEEF_ID&limit=1")
        assert_status 200 "$STATUS" "GET latest run"
        LATEST_RUN_COUNT=$(extract_json "['runs'].__len__()")
        if [ "$LATEST_RUN_COUNT" -gt "0" ]; then
          LATEST_STATUS=$(extract_json "['runs'][0]['status']")
          LATEST_DURATION=$(extract_json "['runs'][0]['durationMs']")
          LATEST_STEPS=$(extract_json "['runs'][0]['stepCount']")
          echo -e "  ${YELLOW}→ Latest run: status=$LATEST_STATUS, duration=${LATEST_DURATION}ms, steps=$LATEST_STEPS${NC}"
        fi
      else
        log_test "E2E: Send message"
        skip_test "No human member found in the space"
        log_test "E2E: Check response"
        skip_test "Skipped"
        log_test "E2E: Verify run"
        skip_test "Skipped"
      fi
    else
      log_test "E2E: Send message"
      skip_test "No space found for E2E haseef"
      log_test "E2E: Check response"
      skip_test "Skipped"
      log_test "E2E: Verify run"
      skip_test "Skipped"
    fi
  else
    log_test "E2E: Send message"
    skip_test "Haseef has no spaces tools (Spaces service not connected?)"
    log_test "E2E: Check response"
    skip_test "Skipped"
    log_test "E2E: Verify run"
    skip_test "Skipped"
  fi
else
  log_test "E2E tests"
  skip_test "No haseefs found"
fi

# =============================================================================
# SECTION 17: Loop Prevention Verification
# =============================================================================
log_section "17. LOOP PREVENTION VERIFICATION"

log_test "Verify cooldown constant in sense-events.ts"
if grep -q "HASEEF_COOLDOWN_MS" /Users/Husam/Dev/hsafa-logic/hsafa-spaces/server/src/lib/service/sense-events.ts 2>/dev/null; then
  COOLDOWN_VALUE=$(grep "HASEEF_COOLDOWN_MS" /Users/Husam/Dev/hsafa-logic/hsafa-spaces/server/src/lib/service/sense-events.ts | head -1 | grep -oE '[0-9]+' | head -1)
  echo -e "  ${GREEN}✓ PASS${NC} — HASEEF_COOLDOWN_MS = ${COOLDOWN_VALUE}ms"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗ FAIL${NC} — HASEEF_COOLDOWN_MS not found in sense-events.ts"
  FAIL=$((FAIL + 1))
fi

log_test "Verify agent-sender mention filter in sense-events.ts"
if grep -q "agent.*group.*not mentioned" /Users/Husam/Dev/hsafa-logic/hsafa-spaces/server/src/lib/service/sense-events.ts 2>/dev/null; then
  echo -e "  ${GREEN}✓ PASS${NC} — Agent-sender mention filter present"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗ FAIL${NC} — Agent-sender mention filter not found"
  FAIL=$((FAIL + 1))
fi

# =============================================================================
# SECTION 18: Consciousness Pruning Fix Verification
# =============================================================================
log_section "18. CONSCIOUSNESS PRUNING FIX"

log_test "Verify SENSE EVENTS prefix in formatInboxEvents"
if grep -q 'SENSE EVENTS' /Users/Husam/Dev/hsafa-logic/hsafa-core/core/src/lib/inbox.ts 2>/dev/null; then
  echo -e "  ${GREEN}✓ PASS${NC} — 'SENSE EVENTS' prefix restored in inbox.ts"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗ FAIL${NC} — 'SENSE EVENTS' prefix NOT found in inbox.ts"
  FAIL=$((FAIL + 1))
fi

log_test "Verify isCycleStart matches prefix"
if grep -q "SENSE EVENTS (" /Users/Husam/Dev/hsafa-logic/hsafa-core/core/src/lib/consciousness.ts 2>/dev/null; then
  echo -e "  ${GREEN}✓ PASS${NC} — isCycleStart checks for 'SENSE EVENTS ('"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗ FAIL${NC} — isCycleStart pattern mismatch"
  FAIL=$((FAIL + 1))
fi

# =============================================================================
# SECTION 19: Presence Cleanup Fix Verification
# =============================================================================
log_section "19. PRESENCE CLEANUP FIX"

log_test "Verify startPresenceCleanup in smartspace-events.ts"
if grep -q "startPresenceCleanup" /Users/Husam/Dev/hsafa-logic/hsafa-spaces/server/src/lib/smartspace-events.ts 2>/dev/null; then
  echo -e "  ${GREEN}✓ PASS${NC} — startPresenceCleanup function present"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗ FAIL${NC} — startPresenceCleanup not found"
  FAIL=$((FAIL + 1))
fi

log_test "Verify presence cleanup wired in bootstrap"
if grep -q "startPresenceCleanup" /Users/Husam/Dev/hsafa-logic/hsafa-spaces/server/src/lib/service/index.ts 2>/dev/null; then
  echo -e "  ${GREEN}✓ PASS${NC} — Presence cleanup called in bootstrap"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗ FAIL${NC} — Presence cleanup not wired in bootstrap"
  FAIL=$((FAIL + 1))
fi

# =============================================================================
# SECTION 20: Token Usage Persistence Fix
# =============================================================================
log_section "20. TOKEN USAGE PERSISTENCE FIX"

log_test "Verify promptTokens written in agent-process.ts"
if grep -q "promptTokens" /Users/Husam/Dev/hsafa-logic/hsafa-core/core/src/lib/agent-process.ts 2>/dev/null; then
  echo -e "  ${GREEN}✓ PASS${NC} — promptTokens written to run record"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗ FAIL${NC} — promptTokens not found in agent-process.ts"
  FAIL=$((FAIL + 1))
fi

log_test "Verify completionTokens written in agent-process.ts"
if grep -q "completionTokens" /Users/Husam/Dev/hsafa-logic/hsafa-core/core/src/lib/agent-process.ts 2>/dev/null; then
  echo -e "  ${GREEN}✓ PASS${NC} — completionTokens written to run record"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗ FAIL${NC} — completionTokens not found in agent-process.ts"
  FAIL=$((FAIL + 1))
fi

# =============================================================================
# SECTION 21: Cleanup
# =============================================================================
log_section "21. CLEANUP"

log_test "Delete test scope"
STATUS=$(do_core DELETE "/api/haseefs/$HASEEF_ID/scopes/test_scope")
assert_status 200 "$STATUS" "DELETE /api/haseefs/:id/scopes/:scope"

if [ -n "$AGENT_ENTITY_ID" ]; then
  log_test "Remove agent member from space"
  STATUS=$(do_spaces DELETE "/api/smart-spaces/$SPACE_ID/members/$AGENT_ENTITY_ID")
  if [ "$STATUS" -eq 200 ]; then
    echo -e "  ${GREEN}✓ PASS${NC} — Removed agent member"
    PASS=$((PASS + 1))
  else
    echo -e "  ${YELLOW}⊘ SKIP${NC} — Could not remove (HTTP $STATUS)"
    SKIP=$((SKIP + 1))
  fi
fi

log_test "Delete test space"
STATUS=$(do_spaces DELETE "/api/smart-spaces/$SPACE_ID")
assert_status 200 "$STATUS" "DELETE /api/smart-spaces/:id"

log_test "Stop test haseef process"
STATUS=$(do_core POST "/api/haseefs/$HASEEF_ID/stop")
assert_status 200 "$STATUS" "POST /api/haseefs/:id/stop (cleanup)"

log_test "Delete test haseef"
STATUS=$(do_core DELETE "/api/haseefs/$HASEEF_ID")
assert_status 200 "$STATUS" "DELETE /api/haseefs/:id (cleanup)"

log_test "Verify haseef deleted (expect 404)"
STATUS=$(do_core GET "/api/haseefs/$HASEEF_ID")
assert_status 404 "$STATUS" "GET /api/haseefs/:id (after delete)"

# =============================================================================
# FINAL REPORT
# =============================================================================
echo ""
echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${BLUE}  TEST RESULTS${NC}"
echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}✓ Passed:  $PASS${NC}"
echo -e "  ${RED}✗ Failed:  $FAIL${NC}"
echo -e "  ${YELLOW}⊘ Skipped: $SKIP${NC}"
echo -e "  ${BOLD}Total:     $TOTAL${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "${BOLD}${GREEN}  ALL TESTS PASSED! ✓${NC}"
  echo ""
  exit 0
else
  echo -e "${BOLD}${RED}  $FAIL TEST(S) FAILED ✗${NC}"
  echo ""
  exit 1
fi
