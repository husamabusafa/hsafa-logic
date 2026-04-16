# Hsafa Simplification Plan

## Goals
1. Remove complex/unused code from `hsafa-core`
2. Remove all unused components from `hsafa-spaces` and `hsafa-spaces/react_app`
3. Create a simple Skills system - always there, attachable to any Haseef
4. Delete old custom skill/scope deployment code

---

## Current State Analysis

### hsafa-core
The core is already relatively clean after V5 refactor. Main areas to review:
- `core/src/agent-builder/` - agent building logic
- `core/src/lib/` - core libraries
- `core/sdks/` - SDKs

### hsafa-spaces/server
Current entities in schema:
- User, Entity, SmartSpace, SmartSpaceMembership, SmartSpaceMessage
- Client, Invitation, MessageResponse, MediaAsset
- Base, BaseMember
- HaseefOwnership, HaseefSchedule, ApiKey

**NO ScopeTemplate or ScopeInstance in current schema** - already removed or never existed in this version.

### hsafa-spaces/react_app
Current pages/components:
- Auth pages (auth-page, auth-callback, verify-email-page)
- Spaces (chat-page, chat-view, create-space-dialog, space-settings, etc.)
- Haseefs (haseefs-page, haseef-grid-page, haseef-create-page, haseef-detail-page, haseef-edit-page)
- Bases (bases-page)
- API Keys (api-keys-page)
- Invitations (invitations-page, invite-dialog)
- Messages (16 message type components)
- User profile, entity profile

---

## Simplification Actions

### Phase 1: Remove Dead Code from hsafa-spaces/server

1. **Check for old scope/scheduler code**
   - Look for any `ScopeTemplate`, `ScopeInstance` references
   - Remove any Docker/container deployment code
   - Remove scheduler-related code if not used

2. **Clean up service/ folder**
   - Review `manifest.ts` - may have old tool definitions
   - Review `tools/` - remove unused tools

3. **Remove unused routes**
   - Check `extension.ts` - may be deprecated

### Phase 2: Simplify hsafa-spaces/react_app

1. **Remove unused components**
   - `code-terminal.tsx` - appears to be unused
   - `chat-ai-previews.tsx` - check if used
   - `chat-forward-dialog.tsx` - check if used
   - `chat-search-results.tsx` - check if used
   - `chat-seen-info.tsx` - check if used

2. **Consolidate pages**
   - Haseef pages could be simplified

### Phase 3: New Simple Skills System

Design:
- Skills are simple objects: `{ id, name, description, tools[], config }`
- Skills are global - defined in code/config, not per-user
- Users "attach" skills to their Haseefs
- Skills add tools to the Haseef's available tools
- No deployment, no Docker, no images - just configuration

New Schema:
```prisma
model Skill {
  id          String   @id @default(uuid())
  name        String
  description String?
  tools       Json     // Tool definitions
  config      Json?    // Default config
  isBuiltin   Boolean  @default(false) // System skills vs user-created
  createdAt   DateTime @default(now())
}

model HaseefSkill {
  id        String   @id @default(uuid())
  haseefId  String   // Core haseef ID
  skillId   String
  config    Json?    // Override config
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  
  @@unique([haseefId, skillId])
}
```

New Pages:
- `/skills` - List all available skills
- `/skills/:id` - Skill detail + attach to Haseef
- Add "Skills" section to Haseef detail page

---

## Removal List

### Files to Review/Delete in hsafa-spaces/server:

1. `src/routes/extension.ts` - Likely deprecated (33 lines)
2. `scripts/` - Check what scripts exist and if needed
3. `src/lib/service/tools/` - Review for unused tools
4. `src/lib/cartesia.ts` - Check if used (voice?)
5. `src/lib/elevenlabs.ts` - Check if used (voice?)

### Files to Review/Delete in hsafa-spaces/react_app:

1. `src/components/code-terminal.tsx` - Check usage
2. `src/components/chat-ai-previews.tsx` - Check usage
3. `src/components/chat-forward-dialog.tsx` - Check usage
4. `src/components/chat-search-results.tsx` - Check usage
5. `src/components/assistant-ui/` - Check what's in here

---

## Implementation Order

1. Create this plan document ✅
2. Remove dead code from hsafa-spaces/server
3. Remove dead code from hsafa-spaces/react_app
4. Create Skills schema migration
5. Create Skills API routes
6. Create Skills UI page
7. Update Haseef detail page to show attached skills
8. Update Haseef creation to optionally attach skills
9. Test and verify
