# Sender System — Final Design

In Hsafa, a **sender is anything that can produce a message**, not just a human.

---

## Sender Types

| sender_type   | What it represents   | Example sender_id   | Example sender_name |
| ------------- | -------------------- | ------------------- | ------------------- |
| `user`        | Human from your app  | `user_123`          | Husam               |
| `assistant`   | The AI agent         | `agent_research_v2` | Research Agent      |
| `service`     | Backend automation   | `daily_report_job`  | Daily Report Bot    |
| `device`      | Node runner / worker | `node_worker_7`     | EU Processing Node  |
| `integration` | External system      | `slack_bot`         | Slack Integration   |
| `tool`        | Tool response        | `scanFilesTool`     | File Scanner Tool   |

A "chat" becomes a **timeline of humans, AI, and machines collaborating**.

---

## Messages Table (Identity-Aware)

Minimal schema — no users table, no participants table.

### `messages`

| field           | meaning                                    |
| --------------- | ------------------------------------------ |
| id              | message id                                 |
| run_id          | the "conversation" id                      |
| role            | user / assistant / tool                    |
| sender_type     | user / assistant / service / device / tool |
| sender_id       | stable unique id of sender                 |
| **sender_name** | display name snapshot at time of sending   |
| client_id       | which device/app sent it                   |
| content         | text or structured JSON                    |
| created_at      | timestamp                                  |

### Why store `sender_name`?

Names can change in the external system.
Each message keeps a **historical snapshot** for accurate chat history display.

---

## Identity Model

Hsafa does **NOT** own users.

Hsafa does **not** manage:
- ❌ user accounts
- ❌ passwords
- ❌ permissions lists

Your **main app handles all of that**.

Hsafa only trusts **signed identity tokens**.

---

## Authentication (Who are you?)

Every request to Hsafa must include a **verified token**.

Hsafa extracts identity from token claims:

| Claim       | Used For            |
| ----------- | ------------------- |
| `sub`       | → sender_id         |
| `name`      | → sender_name       |
| `type`      | → sender_type       |
| `client_id` | → device identifier |
| `org`       | → tenant isolation  |

Tokens can represent:
- Human users
- Backend services
- Node tool runners
- Integrations

---

## Authorization (What can you access?)

Hsafa keeps this **lightweight**.

It does NOT manage chat membership.
Instead, it enforces **tenant isolation**.

### `runs` table includes:

| field    | purpose               |
| -------- | --------------------- |
| id       | run id                |
| org_id   | organization / app id |
| agent_id | which agent           |
| status   | running / done        |

On every request:

```
token.org MUST match runs.org_id
```

**Your main app is responsible for:**
- ✔ Deciding who can join a run
- ✔ Deciding who can send messages
- ✔ Deciding who can view streams

**Hsafa only ensures:**

> "This request belongs to the correct organization and identity is verified."

---

## Securing Non-Human Senders

Since services and devices can send messages or tool results:

| Sender Type | Secure With                                    |
| ----------- | ---------------------------------------------- |
| user        | User JWT from your auth system                 |
| service     | Server API key → exchanged for signed token    |
| device      | Device API key / registered client credentials |
| integration | OAuth or signed webhook tokens                 |

**Never allow anonymous tool results or service messages.**

---

## What Hsafa Never Trusts

- ❌ Raw `sender_id` from request body
- ❌ Raw `sender_name` from client
- ❌ Client-claimed sender_type

All identity must come from a **verified token**, not user input.

---

## Summary

Hsafa is:

> **A secure AI execution engine that records who (human, AI, or machine) said what, using verified external identities, without owning user accounts**

### What this enables:

- ✅ Multi-user chats
- ✅ Multi-device per user
- ✅ Services and automations talking to AI
- ✅ Friendly display names
- ✅ Strong tenant isolation
- ✅ Minimal database schema

---

## Next Steps

Design the **exact JWT formats** for:
- Human users
- Services
- Devices

This ensures implementation stays clean and consistent.
