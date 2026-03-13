# React App — Remaining Work (Mock → Real API)

Status legend: ✅ Done | 🔧 In Progress | ⬜ Pending

## Phase 1: Foundation (API Client + Auth) — ✅ COMPLETE
- ✅ Auth context/provider (`lib/auth-context.tsx`)
- ✅ API client base (`lib/api.ts`) — request helper, auth endpoints
- ✅ Auth pages (login/register, verify email, Google callback)
- ✅ Protected routes, logout wired
- ✅ User profile wired to real auth data

## Phase 2: Haseefs Management — ✅ COMPLETE
- ✅ Extend `api.ts` with haseef endpoints (list, create, get, update, delete, add/remove from space)
- ✅ Haseefs sidebar — fetch real list from `GET /api/haseefs`
- ✅ Create Haseef dialog — call `POST /api/haseefs`
- ✅ Haseef detail — fetch from `GET /api/haseefs/:id`, show real data
- ✅ Delete haseef — call `DELETE /api/haseefs/:id` with confirmation
- ⬜ Edit haseef — call `PATCH /api/haseefs/:id` (UI wired, handler TODO)
- ⬜ Add/remove haseef from space — `POST/DELETE /api/haseefs/:id/spaces/:spaceId`

## Phase 3: Spaces Management — ✅ COMPLETE
- ✅ Extend `api.ts` with space endpoints (list, create, get, update, delete)
- ✅ Spaces sidebar — fetch from `GET /api/smart-spaces` (real data, loading state)
- ✅ Create Space dialog — call `POST /api/smart-spaces/create-for-user`
- ⬜ Space detail/settings — update name/description via `PATCH /api/smart-spaces/:id`
- ⬜ Delete space — `DELETE /api/smart-spaces/:id`

## Phase 4: Members & Invitations — ✅ API + Invitations DONE
- ✅ Extend `api.ts` with member endpoints (list, add, remove, update role, leave, transfer ownership)
- ✅ Extend `api.ts` with invitation endpoints (create, list mine, accept, decline)
- ✅ Invitations page — fetch from `GET /api/invitations`, accept/decline real
- ✅ Invitation count badge — real pending count
- ⬜ Space details panel — fetch real members from `GET /api/smart-spaces/:id/members`
- ⬜ Invite dialog — call `POST /api/smart-spaces/:id/invitations`
- ⬜ Leave space, remove member, update role actions

## Phase 5: Chat (Messages + Real-time)
- ✅ `api.ts` has message endpoints (list, send, typing, seen)
- ⬜ Chat view — fetch messages from `GET /api/smart-spaces/:id/messages`
- ⬜ Send message — `POST /api/smart-spaces/:id/messages`
- ⬜ SSE stream — connect to `GET /api/smart-spaces/:id/stream` for real-time
- ⬜ Typing indicators — `POST /api/smart-spaces/:id/typing`
- ⬜ Read receipts / seen watermarks — `POST /api/smart-spaces/:id/seen`
- ⬜ Reply to message (replyTo metadata)
- ⬜ Interactive message responses — `POST /api/smart-spaces/:id/messages/:msgId/respond`

## Phase 6: Media & Polish
- ⬜ Media upload — `POST /api/media/upload`
- ⬜ Display uploaded images, files, voice, video from real URLs
- ⬜ Remove remaining `currentUser` / mock-data imports from components
- ⬜ Error boundaries and loading states throughout
- ⬜ Optimistic updates for common actions (send message, accept invite)
