# Hsafa Logic - Big Refactor Tasks

## Overview
This document outlines all refactoring tasks based on the hsafa-docs, current codebase analysis, and the user's requirements.

---

## Phase 1: hsafa-gateway Refactor

### 1.1 Schema Alignment (Critical)
- [x] **Fix Run fields mismatch**
  - `Run(smartSpaceId, agentEntityId, agentId, triggeredById, parentRunId)` is now used in:
    - `hsafa-gateway/src/routes/runs.ts`
    - `hsafa-gateway/src/routes/smart-spaces.ts`

- [x] **Fix ToolExecutionTarget mismatch**
  - Schema enum is `server | client | external`
  - Gateway derives `executionTarget` accordingly in `hsafa-gateway/src/lib/run-runner.ts`

- [x] **Fix Client model mismatch**
  - WebSocket registration uses `prisma.client.upsert(...)` in `hsafa-gateway/src/lib/websocket.ts`

### 1.2 Code Simplification
- [x] **Simplify agent-builder logic**
  - Extracted message converters to `src/lib/message-converters.ts`
  - Added `getToolExecutionTarget()` helper in `tool-builder.ts`
  - Reduced `run-runner.ts` from 475 to 375 lines

- [x] **Clean up routes**
  - Removed dead code: `agent-config.ts` and `utils/load-agent-config.ts`
  - Routes are clean with standard CRUD operations

- [x] **Tool execution logic refactor**
  - Centralized `executionTarget` derivation in `getToolExecutionTarget()`
  - Basic tool modes (no-execution, static, pass-through) handled correctly
  - Client-side tool execution working via WebSocket dispatch

### 1.3 Streaming Improvements
- [x] **Review SSE streaming implementation**
  - All blueprint event types are emitted correctly:
    - SmartSpace: `smartSpace.message`, `smartSpace.member.joined/left`
    - Run lifecycle: `run.created`, `run.started`, `run.waiting_tool`, `run.completed`, `run.failed`
    - Streaming: `text.delta`, `reasoning.delta`, `step.start/finish`
    - Tools: `tool.input.start`, `tool.input.delta`, `tool.call`, `tool.result`
    - Messages: `message.user`, `message.assistant`, `message.tool`
  - Added missing `message.user` event emission

---

## Phase 2: react-sdk Refactor

### 2.1 Extract Logic from nextjs-test-app
- [x] **Move useHsafaRuntime logic to ui-sdk (not react-sdk)**
  - Created `@hsafa/ui-sdk` package with `@assistant-ui/react` as peer dependency
  - `useHsafaRuntime` now lives in `ui-sdk/src/useHsafaRuntime.ts`
  - `@hsafa/react-sdk` remains transport-only (no assistant-ui dependency)

- [x] **Move useStreamingToolCalls logic to SDK**
  - Moved to `ui-sdk/src/contexts.tsx` as `StreamingToolCallsProvider` + `useStreamingToolCalls`

- [x] **Move useMembersContext to SDK**
  - Moved to `ui-sdk/src/contexts.tsx` as `MembersProvider` + `useMembers`
  - Also added `PendingToolCallsProvider` + `usePendingToolCalls` for manual tool execution UI

### 2.2 Simplify Client Integration
- [x] **Create unified HsafaProvider component**
  - `ui-sdk/src/HsafaProvider.tsx` wraps all context providers:
    - `AssistantRuntimeProvider` (from @assistant-ui/react)
    - `MembersProvider`
    - `StreamingToolCallsProvider`
    - `PendingToolCallsProvider`
  - Single prop interface for gateway URL, entity, smartSpace, toolExecutor

- [x] **Simplified nextjs-test-app integration**
  - Page.tsx now uses `<HsafaProvider>` instead of manual provider wiring
  - Removed 3 local hook files (useHsafaRuntime, useMembersContext, useStreamingToolCalls)
  - Components import from `@hsafa/ui-sdk` instead of local hooks

### 2.3 Tool Execution Improvements
- [x] **Improved tool executor pattern**
  - `ToolExecutor` type exported from ui-sdk
  - `PendingToolCallsContext` for manual tool execution status tracking

- [ ] **Fix addToolResult flow** (pending testing)
  - Tool results are submitted via `submitToolResult` in context
  - Run resumption handled by gateway

---

## Phase 3: nextjs-test-app Refactor

### 3.1 Simplify After SDK Extraction
- [x] **Replace custom hooks with SDK hooks**
  - Removed local hooks (useHsafaRuntime, useMembersContext, useStreamingToolCalls)
  - Components now import from `@hsafa/ui-sdk`

- [x] **Clean up components**
  - Page.tsx uses `<HsafaProvider>` instead of manual provider wiring
  - Simplified component tree

### 3.2 Fix UX Issues
- [x] **Fix empty box with "undefined" when sending message**
  - Updated `convertSmartSpaceMessage` in ui-sdk to return null for empty messages
  - Messages with no content are now filtered out

- [x] **Add typing indicator (dots like ChatGPT)**
  - Added `TypingIndicator` component with animated bouncing dots
  - Added `StreamingIndicator` that shows dots when assistant is thinking
  - Uses `useThread().isRunning` to detect streaming state

- [x] **Fix streaming text display**
  - Streaming messages with no content are filtered (return null)
  - Partial JSON parsing already handled in tool-fallback.tsx

### 3.3 Persist SmartSpace Selection
- [x] **Add URL-based SmartSpace persistence**
  - Uses `useSearchParams` and `useRouter` from next/navigation
  - Reads `?space=xxx` param on mount
  - Updates URL with `router.replace()` when switching spaces
  - Example: `/?space=clx123abc` persists across refresh

---

## Phase 4: Create @hsafa/ui-sdk Package

### 4.1 Package Setup
- [x] **Create new package `ui-sdk/`** (completed in Phase 2)
  - Package created with package.json, tsconfig.json
  - Depends on `@hsafa/react-sdk` and `@assistant-ui/react` (peer deps)
  - Uses ESNext module with Bundler resolution

### 4.2 Prebuilt Components
- [ ] **HsafaChat component**
  - Complete chat UI component
  - Configurable via props (theme, layout, features)

- [ ] **HsafaThread component**
  - Thread/conversation view
  - Message list with proper styling

- [ ] **HsafaComposer component**
  - Message input with submit button
  - Support for attachments (future)

- [ ] **HsafaMessage component**
  - Individual message display
  - Support for user, assistant, tool messages

- [ ] **HsafaToolUI components**
  - Default tool call display component
  - Loading spinner for running tools
  - Error display for failed tools

- [ ] **HsafaTypingIndicator component**
  - Animated dots like ChatGPT
  - Shows when assistant is generating

### 4.3 assistant-ui Integration
- [ ] **Create runtime adapter**
  - Bridge between react-sdk and assistant-ui's `useExternalStoreRuntime`
  - Handle message format conversion

- [ ] **Tool UI registration system**
  - Easy way to register custom tool UIs
  - Support for the `Tools({ toolkit })` pattern from docs

- [ ] **Theme system**
  - Support light/dark mode
  - Customizable colors via CSS variables

### 4.4 Plugin Architecture
- [ ] **Create plugin system**
  - Allow easy extension of UI
  - Support for custom message renderers
  - Support for custom tool UIs

---

## Phase 5: Testing & Documentation

### 5.1 Testing
- [ ] **Add tests for react-sdk hooks**
- [ ] **Add tests for ui-sdk components**
- [ ] **Test streaming scenarios**
- [ ] **Test tool execution flows**

### 5.2 Documentation
- [ ] **Update README for each package**
- [ ] **Add usage examples**
- [ ] **Document the plugin system**

---

## Notes & Guidelines

### Do NOT Break
1. Core streaming pipeline (Redis Stream + SSE)
2. Tool call/result flow
3. SmartSpace message persistence
4. Agent execution loop

### Focus Areas
1. **Tool calling logic** - This is new and needs careful attention
2. **Streaming UX** - Fix the empty box / undefined issues
3. **SDK simplification** - Make integration dead simple

### Architecture Decisions
1. **react-sdk** = Hooks only (data fetching, state management)
2. **ui-sdk** = UI components + assistant-ui integration
3. **nextjs-test-app** = Reference implementation using both SDKs

---

## Execution Order

1. **Phase 1.1** - Schema alignment (critical foundation)
2. **Phase 3.2** - Fix UX issues (small, safe, unblocks debugging)
3. **Phase 4** - Create/finish `ui-sdk` runtime adapter + UI components
4. **Phase 2** - Expand `react-sdk` only where it’s purely transport/state (no assistant-ui coupling)
5. **Phase 1.2, 1.3, 2.2, 2.3** - Improvements (ongoing)
6. **Phase 5** - Testing & docs (final)

---

## Current Issues Identified

### Streaming Issues
- Empty message box appears with "undefined" when sending
- Likely cause: `streamingMessages` created before any text arrives
- Fix: Don't show streaming message until first content or show typing indicator

### Tool Call Issues
- Tool input streaming (`tool.input.start`, `tool.input.delta`) may not be fully working
- Need to verify end-to-end flow for basic tools with `addToolResult`

### Code Duplication
- `useHsafaRuntime.ts` in nextjs-test-app duplicates SDK logic
- `useStreamingToolCalls.tsx` contains logic that should be in SDK
- Message format conversion happens in multiple places

---

## Files to Review/Refactor

### hsafa-gateway
- `src/routes/runs.ts` - Run creation and management
- `src/routes/smart-spaces.ts` - SmartSpace endpoints
- `src/agent-builder/` - Agent execution logic
- `src/lib/websocket.ts` - Client/Device handling
- `src/lib/events.ts` - Event emission

### react-sdk
- `src/hooks.ts` - Main hooks (needs expansion)
- `src/client.ts` - API client
- `src/types.ts` - Type definitions

### nextjs-test-app
- `hooks/useHsafaRuntime.ts` - Should be in SDK
- `hooks/useStreamingToolCalls.tsx` - Should be in SDK
- `hooks/useMembersContext.tsx` - Should be in SDK
- `components/assistant-ui/tool-fallback.tsx` - Move to ui-sdk
- `app/page.tsx` - Simplify after SDK extraction
