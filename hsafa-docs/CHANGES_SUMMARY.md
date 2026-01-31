# Changes Summary — January 31, 2026

## Overview

This document summarizes all changes made to simplify the Hsafa system and create a working SDK + Gateway integration.

---

## 1. Database Schema Simplification

### Removed
- **`Tenant` table** — No multi-tenancy, single global namespace
- **`DeviceSession` table** — Simplified device tracking
- **`tenantId` / `orgId`** fields from all models

### Updated Models

| Model | Change |
|-------|--------|
| `Agent` | Now unique by `name` only (global namespace) |
| `Run` | Removed `orgId`, simplified |
| `Device` | Auto-created on first interaction, unique by `deviceKey` |

### Final Schema (Simplified)
```
Agent → AgentVersion → Run → RunEvent
                         ↳ ToolCall → ToolResult
Device (auto-created)
```

---

## 2. Gateway Code Updates

### Files Modified

**`src/routes/agents.ts`**
- Removed `tenantId` parameter
- Agents now looked up by `name` only (global)

**`src/routes/runs.ts`**
- Removed `orgId` parameter
- Added auto-select latest `agentVersionId` if not provided
- Simplified run creation

**`src/lib/websocket.ts`**
- Removed `tenantId` from device registration
- Devices now auto-created via `upsert` on first connection
- Removed `DeviceSession` tracking (simplified)

### API Changes

| Endpoint | Change |
|----------|--------|
| `POST /api/agents` | Removed `tenantId`, just `name` + `config` |
| `POST /api/runs` | Removed `orgId`, `agentVersionId` now optional |
| `WS /devices/connect` | Removed `tenantId`, simplified device registration |

---

## 3. New React SDK Hook: `useHsafaGateway`

### Location
`react-sdk/src/hooks/useHsafaGateway.ts`

### Purpose
Simple, clean hook for connecting React apps to the Hsafa Gateway.

### Features
- Auto-registers agent on mount
- Starts runs and streams events via SSE
- Handles browser tools (auto-execute or UI callback)
- Sends tool results back to gateway

### Usage Example
```tsx
import { useHsafaGateway } from '@hsafa/react-sdk';

function Chat() {
  const { messages, sendMessage, isStreaming } = useHsafaGateway({
    gatewayUrl: 'http://localhost:3001',
    agentConfig: myAgentConfig,
    tools: {
      showNotification: async (args) => {
        alert(args.message);
        return { shown: true };
      }
    },
    onToolCall: (toolCall, addResult) => {
      // Handle UI tools that need user interaction
    }
  });

  return (
    <div>
      {messages.map(m => <div key={m.id}>{m.content}</div>)}
      <button onClick={() => sendMessage('Hello!')}>Send</button>
    </div>
  );
}
```

### API
```ts
interface HsafaGatewayAPI {
  messages: GatewayMessage[];
  isStreaming: boolean;
  status: 'idle' | 'registering' | 'running' | 'streaming' | 'waiting_tool' | 'completed' | 'error';
  runId: string | null;
  agentId: string | null;
  sendMessage: (text: string) => Promise<void>;
  addToolResult: (toolCallId: string, result: any) => Promise<void>;
  stop: () => void;
  reset: () => void;
  error: Error | null;
  pendingToolCalls: ToolCall[];
}
```

---

## 4. Updated Test App (`vite-test-app`)

### Location
`vite-test-app/src/App.tsx`

### Features Demonstrated
1. **Browser tool (auto-execute)**: `showNotification` — Shows toast notification
2. **UI tool (needs approval)**: `requestApproval` — Shows modal dialog

### How to Run
```bash
# Terminal 1: Start gateway
cd hsafa-gateway
pnpm dev

# Terminal 2: Start test app
cd vite-test-app
pnpm dev
```

### Test Scenarios
- Say: "Show me a success notification" → Triggers `showNotification` tool
- Say: "I want to delete my account" → Triggers `requestApproval` tool with dialog

---

## 5. Architecture Documentation Updates

### New File
`hsafa-docs/architecture-review/sender-identity-system.md`
- Documents sender types (user, assistant, service, device, tool)
- Token-based identity model
- Security guidelines

---

## 6. What's Still Remaining

| Feature | Status | Notes |
|---------|--------|-------|
| **Device tool pause/resume** | ⚠️ 80% | Browser tools work, device tools need testing |
| **Auth middleware** | ❌ Not started | JWT verification not implemented |
| **Crash recovery** | ❌ Not started | Schema ready, logic not implemented |
| **CLI (`hsafa-agent`)** | ❌ Not started | Documented but not built |

---

## 7. Migration Required

Run this command to apply database changes:
```bash
cd hsafa-gateway
npx prisma migrate dev --name simplify-global-namespace
```

**Note**: Requires `DATABASE_URL` to be set in `.env`

---

## Summary

| Component | Status |
|-----------|--------|
| Database schema | ✅ Simplified |
| Gateway routes | ✅ Updated |
| React SDK hook | ✅ Created (`useHsafaGateway`) |
| Test app | ✅ Updated with demo |
| Documentation | ✅ Updated |

**The system is now simpler and ready for testing.**
