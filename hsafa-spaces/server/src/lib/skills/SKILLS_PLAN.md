# Advanced Skill Templates Plan (v3) — Senses-First Design

## What Makes Hsafa Different

Most AI agent tools are **passive** — the LLM only acts when asked. Hsafa's **sense events** make haseefs **proactive**. A haseef can:
- Notice a new email and summarize it before you ask
- Alert you when a web page changes or a topic trends
- Fire when a database query returns new rows
- Run code on a schedule and act on the result

**Every skill has two halves: Tools (what the haseef can do) and Senses (what the haseef can notice).**

---

## Architecture Pattern (per template)

Each skill template:
- **File**: `server/src/lib/skills/templates/<name>.ts`
- **Exports**: `<name>Template: SkillTemplateDefinition`
- **Registered in**: `templates/index.ts` → `ALL_TEMPLATES`
- **Config**: user-provided settings validated by `configSchema`
- **Tools**: registered with Core, called by the LLM during a run
- **Senses**: background listeners/pollers that push sense events to Core → wake the haseef
- **Watch management tools**: LLM can create/delete watches (monitors) that trigger senses
- **Instructions**: prompt scaffolding so the LLM knows how to use tools AND respond to senses

### Sense Infrastructure

**New DB table: `SkillWatch`** — generic watch/monitor for all skills:
```
SkillWatch {
  id            UUID PK
  haseefId      String        // which haseef gets the sense event
  instanceId    UUID FK       // which skill instance owns this watch
  watchType     String        // "page_changed", "search_alert", "email_filter", "query_watch", "code_watch"
  description   String        // human-readable: "Monitor HN front page"
  config        JSONB         // type-specific: { url, query, code, intervalMs, conditions... }
  intervalMs    Int?          // poll interval (null = push-based like IMAP IDLE)
  lastCheckedAt DateTime?
  lastSnapshot  JSONB?        // last known state for change detection
  active        Boolean       // can be paused
  createdAt     DateTime
  updatedAt     DateTime
}
```

**Watch Runner** (`lib/skills/watch-runner.ts`):
- Unified polling loop (every 30s, same as schedule-runner)
- On each tick: load all active watches where `lastCheckedAt + intervalMs <= now`
- Dispatch to skill-specific check function based on `watchType`
- Each check function compares current state to `lastSnapshot`, fires sense event if changed
- Updates `lastCheckedAt` and `lastSnapshot`
- Push-based senses (like IMAP IDLE) run in `startSenseLoop()` on the handler, not the watch runner

---

## 1. Web Skill (`web.ts`)

**Goal**: Grok/Perplexity-level web research. Pure tool skill — no senses needed. The haseef searches and reads when asked.

### Config Schema
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `searchProvider` | `"google"\|"bing"\|"tavily"\|"serper"` | `"serper"` | Search API provider |
| `searchApiKey` | `string` | — | API key for the chosen search provider |
| `googleCxId` | `string?` | — | Google CX ID (only if provider=google) |
| `maxResults` | `number` | `10` | Max search results per query |
| `maxContentChars` | `number` | `15000` | Max chars returned per read_page call (after chunking) |
| `topChunks` | `number` | `8` | Number of most-relevant chunks to return |
| `userAgent` | `string` | `"Mozilla/5.0 (compatible; HsafaBot/1.0)"` | User-Agent for HTTP requests |
| `cacheTtlMs` | `number` | `300000` | Cache TTL (default 5 minutes) |

### Tools (what the haseef can do)

#### `web_search`
Search the web. Returns titles, URLs, and snippets.

**Input**: `{ query: string, numResults?: number, freshness?: "day"|"week"|"month" }`
**Output**: `{ results: [{ title, url, snippet, position }], query, cached }`

#### `read_page`
Fetch a web page, extract readable content, and return the most relevant chunks for a given query. Uses `@mozilla/readability` + `jsdom`. Splits into ~500-token chunks, scores by keyword overlap (TF-IDF-lite), returns top-k.

**Input**: `{ url: string, query?: string, extractImages?: boolean }`
**Output**: `{ title, url, wordCount, chunks: [{ text, relevanceScore }], images?: [...], warning?: string, cached }`

#### `read_page_raw`
Fetch raw HTML. Optional CSS selector via `cheerio`.

**Input**: `{ url: string, selector?: string, maxLength?: number }`
**Output**: `{ html, url, statusCode, contentType }`

#### `extract_links`
Extract links from a page, optionally filtered by pattern.

**Input**: `{ url: string, pattern?: string, limit?: number }`
**Output**: `{ links: [{ text, href, isExternal }], count }`

### Senses
None — pure tool skill.

### Instructions
```
You have powerful web research capabilities.

RESEARCH STRATEGY:
  1. web_search to find sources
  2. read_page with a query to extract the most relevant parts
  3. Read 2-3 sources and synthesize, always cite URLs
  4. If a page warns about JS rendering, try a different source

SEARCH TIPS:
  - Use specific, well-crafted queries
  - If the first search doesn't answer, reformulate with different terms
  - For current events, use freshness="day" or freshness="week"

SYNTHESIS:
  - Don't just summarize one page — synthesize across sources
  - Include source URLs [Source](url)
  - Present findings as clear, structured answers
```

### Dependencies
- `@mozilla/readability` + `jsdom` (content extraction)
- `cheerio` (CSS selectors)
- Native `fetch` (Node 18+)

---

## 2. Email Skill (`email.ts`)

**Goal**: Full email capability with **real-time inbox sensing via IMAP IDLE**. The haseef doesn't just read email when asked — it notices new emails as they arrive and can act proactively.

### Limitations
- **OAuth not supported yet.** Gmail requires App Passwords (2FA). Microsoft needs OAuth2 (Phase 2). Self-hosted mail servers work with password auth.

### Config Schema
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `smtpHost` | `string` | — | SMTP server hostname |
| `smtpPort` | `number` | `587` | SMTP port |
| `smtpSecure` | `boolean` | `false` | Use TLS (true for port 465) |
| `imapHost` | `string?` | — | IMAP server hostname |
| `imapPort` | `number` | `993` | IMAP port |
| `email` | `string` | — | Email address |
| `password` | `string` | — | Password or app password |
| `fromName` | `string?` | — | Display name for sent emails |
| `maxFetchCount` | `number` | `20` | Max emails to fetch at once |
| `requireConfirmation` | `boolean` | `true` | Require draft→confirm flow |
| `enableIdleSense` | `boolean` | `true` | Enable real-time IMAP IDLE listening |

### Tools (what the haseef can do)

#### `draft_email`
Compose email for review. NOT sent until `confirm_send`.

**Input**: `{ to, subject, body, html?, cc?, bcc?, replyToMessageId?, threadId? }`
**Output**: `{ draftId, to, subject, bodyPreview }`

#### `confirm_send`
Send a previously drafted email.

**Input**: `{ draftId: string }`
**Output**: `{ success, messageId, to, subject }`

#### `send_email` (shortcut)
Draft + send in one step (only if `requireConfirmation: false`).

#### `list_emails`
List email threads from a folder (grouped by In-Reply-To/References).

**Input**: `{ folder?, limit?, unreadOnly?, since? }`
**Output**: `{ threads: [{ threadId, subject, participants, lastDate, snippet, messageCount, isRead, hasAttachments }] }`

#### `read_email`
Read full thread or single message.

**Input**: `{ messageId?, threadId? }`
**Output**: `{ messages: [{ messageId, from, to, cc, date, body, attachments }], subject }`

#### `search_emails`
Search by criteria.

**Input**: `{ query?, from?, subject?, since?, before?, hasAttachment?, limit? }`
**Output**: `{ threads: [...], count }`

#### `list_folders` / `move_email` / `mark_email` / `download_attachment`
(Same as v2 — folder listing, move, mark read/unread/flag, download attachments)

### Watch Tools (email filters the haseef creates)

#### `create_email_filter`
Create a filter that fires sense events when matching emails arrive.

**Input**:
```json
{
  "description": "Alert me about emails from my boss",
  "from": "string? (sender pattern — partial match)",
  "subject": "string? (subject pattern — partial match)",
  "keywords": "string[]? (body must contain any of these)",
  "hasAttachment": "boolean?",
  "priority": "'high' | 'normal' (high = fires immediately, normal = batched)"
}
```
**Output**: `{ filterId, description }`

#### `list_email_filters` / `delete_email_filter`
Manage filters.

### Sense Events (what wakes the haseef)

#### `email.received`
Fired for EVERY new email (when `enableIdleSense: true`). The haseef's instructions determine whether to act or ignore.
```json
{
  "messageId": "...",
  "from": "boss@company.com",
  "to": ["me@example.com"],
  "subject": "Urgent: Project deadline moved",
  "snippet": "Hi, I need to let you know that...",
  "date": "2026-04-16T11:30:00Z",
  "hasAttachments": false,
  "folder": "INBOX"
}
```

#### `email.filter_matched`
Fired when a new email matches a user-created filter. Includes the filter context so the haseef knows WHY it was alerted.
```json
{
  "filterId": "...",
  "filterDescription": "Emails from my boss",
  "matchedOn": ["from"],
  "email": { "messageId", "from", "subject", "snippet", "date" },
  "priority": "high"
}
```

**Implementation**:
- `email.received`: IMAP IDLE listener in `startSenseLoop()` — real-time, no polling
- `email.filter_matched`: When `email.received` fires, check against active SkillWatch rows of type `email_filter`. If match → fire additional `email.filter_matched` event
- This is **push-based** (IMAP IDLE), not poll-based — near-instant delivery

### Instructions
```
You have full email access AND real-time inbox awareness.

SENDING (draft → confirm):
  1. draft_email to compose — NOT sent yet
  2. Show user what you're sending (to, subject, body)
  3. confirm_send only after explicit approval
  4. NEVER skip confirmation

READING:
  - list_emails returns threads (conversations)
  - read_email with threadId for full conversation
  - search_emails for specific lookups

SENSES — Real-time inbox:
  You receive email.received events as emails arrive.
  You can create filters with create_email_filter for targeted alerts.

RESPONDING TO SENSE EVENTS:
  When you receive email.received:
  - Briefly summarize the email (from, subject, key content)
  - If it seems urgent or actionable, highlight that
  - If the user has context about this sender/topic, connect the dots
  
  When you receive email.filter_matched:
  - This matched a filter the user set up — treat it as higher priority
  - Reference the filter description to remind the user why they're being alerted
  - Suggest specific actions (reply, forward, flag)

SAFETY:
  - NEVER send without draft→confirm
  - Warn about suspicious emails
  - NEVER share email contents with unauthorized users

EXAMPLES:
  User: "Tell me whenever my boss emails me"
  → create_email_filter { from: "boss@company.com", description: "Emails from my boss", priority: "high" }

  User: "Watch for emails with invoices attached"
  → create_email_filter { keywords: ["invoice", "payment"], hasAttachment: true, description: "Invoice emails", priority: "normal" }
```

### Dependencies
- `nodemailer` (SMTP)
- `imapflow` (IMAP + IDLE)
- `mailparser` (MIME parsing, thread grouping, attachments)

---

## 3. Code Skill (`code.ts`)

**Goal**: Execute code in isolated environment with state persistence, PLUS **programmable data sensors** — the haseef can set up code-based watches that run periodically and fire when conditions are met.

### Security Model
- **JavaScript**: `isolated-vm` (real V8 isolates, separate heap, no host access)
- **Python**: subprocess with restricted builtins + `resource.setrlimit`
- Adequate for LLM-generated code from trusted prompts. Not for arbitrary untrusted input.

### Config Schema
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `allowedLanguages` | `string[]` | `["javascript"]` | `javascript`, `python` |
| `timeoutMs` | `number` | `10000` | Max execution time |
| `maxOutputLength` | `number` | `50000` | Max stdout/stderr chars |
| `memoryLimitMb` | `number` | `128` | Memory limit |
| `persistState` | `boolean` | `true` | Keep variables across calls |
| `sessionTtlMs` | `number` | `600000` | Session TTL (10 min) |

### Tools (what the haseef can do)

#### `run_code`
Execute code with persistent session state (notebook-style).

**Input**: `{ language: "javascript"|"python", code: string }`
**Output**: `{ stdout, stderr, result, executionTimeMs, error?, sessionId }`

#### `run_code_with_data`
Execute code with injected `input` variable.

**Input**: `{ language, code, data: any }`
**Output**: Same as `run_code`

#### `reset_session`
Clear persisted state.

### Watch Tools (programmable sensors)

#### `create_code_watch`
Create a code-based sensor. The code runs periodically, and if it returns a truthy `result`, a sense event fires. This is incredibly powerful — it's a programmable trigger for anything computable.

**Input**:
```json
{
  "description": "Check if Bitcoin price crossed $100k",
  "language": "javascript",
  "code": "const res = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot'); const data = await res.json(); const price = parseFloat(data.data.amount); ({ triggered: price > 100000, price, message: `BTC is $${price}` })",
  "intervalMinutes": "number (default: 15, min: 5)",
  "condition": "'truthy' | 'changed' (truthy = fire when result.triggered is true, changed = fire when result differs from last run)"
}
```
**Output**: `{ watchId, description, intervalMinutes }`

**Note**: Code watches run in the same isolated-vm sandbox. If `allowNetwork` on the code watch is needed, we use a separate execution path that permits `fetch`. The config for the code skill can include `allowNetworkInWatches: boolean`.

#### `list_code_watches` / `delete_code_watch`
Manage code watches.

### Sense Events (what wakes the haseef)

#### `code.watch_triggered`
Fired when a code watch's condition is met.
```json
{
  "watchId": "...",
  "description": "Check if Bitcoin price crossed $100k",
  "result": { "triggered": true, "price": 100234.50, "message": "BTC is $100234.50" },
  "condition": "truthy",
  "executionTimeMs": 340,
  "previousResult": { "triggered": false, "price": 99800.00 },
  "detectedAt": "2026-04-16T12:15:00Z"
}
```

#### `code.watch_error`
Fired when a code watch fails (so the haseef can fix or disable it).
```json
{
  "watchId": "...",
  "description": "...",
  "error": "TypeError: Cannot read property 'amount' of undefined",
  "consecutiveFailures": 3,
  "detectedAt": "..."
}
```

**Implementation**:
- Code watches run via the watch runner polling loop
- Each tick: execute the code in isolated-vm, compare result to condition
- `truthy`: fire if `result.triggered` is truthy
- `changed`: fire if JSON.stringify(result) differs from `lastSnapshot`
- After 5 consecutive failures, auto-deactivate and fire `code.watch_error`

### Instructions
```
You can execute code AND set up automated data sensors.

TOOLS — On-demand code execution:
  - run_code for calculations, data processing, text manipulation
  - Variables persist across calls (notebook-style)
  - run_code_with_data to process structured data

SENSES — Programmable sensors:
  You can create code watches that run automatically and alert you:
  - "truthy" condition: fires when your code returns { triggered: true }
  - "changed" condition: fires when the output changes from last run

RESPONDING TO SENSE EVENTS:
  When you receive code.watch_triggered:
  - Explain what was detected using the watch description + result
  - Take the action the user wanted (notify them, trigger another skill, etc.)
  
  When you receive code.watch_error:
  - The watch code failed — explain the error
  - Suggest a fix or offer to update the watch code

EXAMPLES:
  User: "Tell me when Bitcoin crosses $100k"
  → create_code_watch with fetch + price check, condition: "truthy"

  User: "Watch this API endpoint and tell me when the response changes"
  → create_code_watch with fetch + return parsed response, condition: "changed"

  User: "Every hour, count how many errors are in the logs and tell me if it's over 100"
  → create_code_watch with fetch to log API + count, condition: "truthy", intervalMinutes: 60
```

### Dependencies
- `isolated-vm` (V8 isolates)
- `child_process` (Python subprocess)

---

## 4. Database Skill — Adding Senses (upgrade existing `database.ts`)

The existing database skill only has tools. Adding **query watches** makes it proactive.

### New Watch Tools

#### `create_query_watch`
Run a SQL query periodically and fire when results change or match a condition.

**Input**:
```json
{
  "description": "Alert when new orders come in",
  "sql": "SELECT COUNT(*) as cnt FROM orders WHERE created_at > NOW() - INTERVAL '1 hour'",
  "condition": "'changed' | 'truthy' | 'row_count_changed'",
  "intervalMinutes": "number (default: 5)"
}
```
**Output**: `{ watchId, description, intervalMinutes }`

#### `list_query_watches` / `delete_query_watch`

### Sense Events

#### `database.query_changed`
```json
{
  "watchId": "...",
  "description": "Alert when new orders come in",
  "sql": "SELECT COUNT(*) ...",
  "currentResult": { "rows": [{ "cnt": 15 }] },
  "previousResult": { "rows": [{ "cnt": 12 }] },
  "condition": "changed",
  "detectedAt": "..."
}
```

---

## Shared Infrastructure

### `SkillWatch` DB Table (new Prisma model)
```prisma
model SkillWatch {
  id            String    @id @default(uuid()) @db.Uuid
  haseefId      String    @map("haseef_id")
  instanceId    String    @map("instance_id") @db.Uuid
  watchType     String    @map("watch_type")              // "page_changed", "search_alert", "email_filter", "query_watch", "code_watch"
  description   String
  config        Json      @default("{}") @db.JsonB        // type-specific config
  intervalMs    Int?      @map("interval_ms")             // null = push-based (IMAP IDLE)
  lastCheckedAt DateTime? @map("last_checked_at") @db.Timestamptz(6)
  lastSnapshot  Json?     @map("last_snapshot") @db.JsonB
  active        Boolean   @default(true)
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  instance SkillInstance @relation(fields: [instanceId], references: [id], onDelete: Cascade)

  @@index([haseefId, active])
  @@index([instanceId])
  @@index([active, lastCheckedAt])
  @@map("skill_watches")
}
```

### Watch Runner (`lib/skills/watch-runner.ts`)
Unified polling loop for all poll-based watches:
```
every 30s:
  1. SELECT * FROM skill_watches WHERE active AND intervalMs IS NOT NULL AND (lastCheckedAt IS NULL OR lastCheckedAt + intervalMs <= now())
  2. For each watch, dispatch to skill-specific checker:
     - "page_changed" → fetch URL, diff against snapshot
     - "search_alert" → run search, compare result URLs
     - "query_watch" → run SQL, compare rows
     - "code_watch" → execute code, check condition
  3. Update lastCheckedAt + lastSnapshot
  4. If condition met → pushSenseEvent to Core
```

### In-Memory LRU Cache (`lib/skills/cache.ts`)
Shared cache for deduplicating fetches within a session. 500 entries, LRU eviction.

---

## Summary: All Skills, Tools, and Senses

### Web (category: research) — **tools only, no senses**
| Tools | Senses |
|-------|--------|
| `web_search` | None |
| `read_page` | |
| `read_page_raw` | |
| `extract_links` | |

### Email (category: communication)
| Tools | Senses |
|-------|--------|
| `draft_email` / `confirm_send` / `send_email` | `email.received` (IMAP IDLE — real-time) |
| `list_emails` / `read_email` / `search_emails` | `email.filter_matched` |
| `list_folders` / `move_email` / `mark_email` / `download_attachment` | |
| `create_email_filter` / `list_email_filters` / `delete_email_filter` | |

### Code (category: computation)
| Tools | Senses |
|-------|--------|
| `run_code` / `run_code_with_data` / `reset_session` | `code.watch_triggered` |
| `create_code_watch` / `list_code_watches` / `delete_code_watch` | `code.watch_error` |

### Database (category: data) — existing, upgraded
| Tools | Senses |
|-------|--------|
| `query` / `list_tables` / `describe_table` / `execute` | `database.query_changed` |
| `create_query_watch` / `list_query_watches` / `delete_query_watch` | |

### Scheduler (category: automation) — existing
| Tools | Senses |
|-------|--------|
| `create_schedule` / `list_schedules` / `update_schedule` / `delete_schedule` | `schedule.triggered` |

**Totals: 5 skills, 26 tools, 5 sense event types**

---

## Implementation Order

### Phase 1 — Shared infrastructure
1. Add `SkillWatch` to Prisma schema + migrate
2. Build `watch-runner.ts` (unified polling loop)
3. Build `cache.ts` (shared LRU)

### Phase 2 — New skills (one at a time)
4. **Web** — tools only (no senses)
5. **Code** — tools + code_watch/watch_error senses
6. **Email** — tools + IMAP IDLE sense + email_filter sense

### Phase 3 — Upgrade existing
7. **Database** — add query_watch sense + watch management tools

### Phase 4 — Enhancements
8. Web: `screenshot_page` (Puppeteer for JS-rendered pages)
9. Email: OAuth2 for Gmail/Outlook
10. Code: `install_package`
11. All: rate limiting per instance

## Per-template Checklist
- [ ] Create `templates/<name>.ts` with `SkillTemplateDefinition`
- [ ] Register in `templates/index.ts`
- [ ] Implement sense event check functions for watch runner
- [ ] Add npm dependencies to `server/package.json`
- [ ] Update instructions to cover both tools AND sense responses
- [ ] Test: tool call → result flow
- [ ] Test: watch creation → sense event → haseef wakes and acts
