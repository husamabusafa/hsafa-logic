# RN App — Remaining Improvements & Missing Features

> Items ported from the react_app (Vite) that are missing or broken in the RN app.
> Reference: `react_app/src/components/` and `react_app/src/App.tsx`
>
> **Status**: Most items completed. See ✅/⏭️ markers below.

---

## 1. Theme & Colors ✅

### 1a. Primary color → `#f97676` ✅
- Updated in both `lightColors` and `darkColors`, plus `messageMine`, `primaryLight`

### 1b. Dark theme background → warm black ✅
- Changed from `#0f172a` to `#0a0a0a`, updated `surface`, `card`, `border`, `tabBar`, etc.

---

## 2. Chat Screen — Header → Space Details ✅

### 2a. Tap chat header to open Space Details ✅
- Header center wrapped in `TouchableOpacity` → navigates to `SpaceSettings`

### 2b. Space Details parity ✅
- Added: invite link toggle, regenerate code, copy code, add haseef modal
- Existing: edit name/description, member management, email invite, leave/delete

---

## 3. Avatars in Chat ✅

### 3a. Sender avatars in chat messages ✅
- Added 28px avatar circles next to other users' messages (real avatar or initial/sparkles fallback)
- Avatar spacer for consecutive messages from same sender

### 3b. Space list avatars ✅
- Already present in SpacesListScreen

---

## 4. Reply → Auto-scroll to Replied Message ✅

### 4a. Tap reply banner to scroll to original ✅
- Reply banner converted from `View` to `TouchableOpacity`
- On press: `flatListRef.scrollToIndex({ index, animated: true, viewPosition: 0.3 })`

---

## 5. Audio Message Playback ⏭️

### 5a. Replace `expo-av` with `expo-audio`
- **Status**: Deferred — `expo-av` still works, migration can happen when SDK 54 is adopted
- Current implementation in `MessageRenderer.tsx` is functional

### 5b. Playback works end-to-end
- Voice messages play, pause, resume, and show progress bar

---

## 6. Create Space — Parity with React App ✅

### 6a. Email invites on creation ✅
- `CreateSpaceScreen.tsx` already passes `inviteEmails` to `spacesApi.create()` which handles server-side

---

## 7. Space List — Missing Features

### 7a. Last message preview
- **React app** sidebar shows last message text + timestamp for each space
- **RN app**: shows member count but no last message
- **Fix**: `SpacesListScreen.tsx` — if the API returns `lastMessage`, show it

### 7b. Unread count badge
- **React app**: shows unread count badge on space rows
- **RN app**: no unread indicators
- **Fix**: track unread counts from SSE events or API, show badge on each space row

### 7c. Online status indicators
- **React app**: shows green dot for online members
- **RN app**: no online indicators

---

## 8. Haseef Detail — Missing Actions ✅

### 8a. Delete haseef ✅
- Already existed in `HaseefDetailScreen.tsx` (Danger Zone section)

### 8b. Navigate to haseef's spaces ✅
- Space rows now tappable → navigates to SpacesTab > Chat via cross-tab navigation
- Added chevron-forward icon for visual affordance

---

## 9. Invite System — Full Parity ✅

### 9a. Invite from space details ✅
- Email invitation: `InviteToSpaceScreen.tsx` (navigate from SpaceSettings)
- Add haseef: new modal in `SpaceSettingsScreen.tsx` with haseef picker
- Toggle invite link: added active/inactive toggle
- Copy invite code: tap-to-copy with clipboard
- Regenerate code: added with confirmation alert

### 9b. Join space by invite link
- `JoinSpaceByCodeScreen.tsx` handles manual code entry
- Deep link handling is a platform concern (deferred)

---

## 10. Chat Features ✅

### 10a. Message forwarding ✅
- `ForwardMessageModal.tsx` wired via long-press action sheet

### 10b. Message search ✅
- `ChatSearchBar.tsx` accessible via search icon in chat header

### 10c. File/document rendering ✅
- File messages now tappable (opens URL), file-type-aware icons, download indicator

### 10d. Seen-by indicators ✅
- `SeenInfoModal.tsx` accessible via long-press > Info action

### 10e. Typing dots animation ✅
- New `TypingDots.tsx` component with animated bouncing dots + text

---

## 11. Profile / Settings ⏭️

### 11a. User profile editing
- `ProfileEditScreen.tsx` has name editing + avatar upload UI
- **Blocked**: No server-side profile update endpoint exists (both apps have TODO)

### 11b. Google OAuth
- Deferred — requires `expo-auth-session` setup and server-side OAuth flow

---

## 12. Bases — Full Feature Parity ✅

### 12a. Base detail actions ✅
- `BaseDetailScreen.tsx` already supports: view members/roles, invite code copy,
  toggle invite link, regenerate code, remove members, view haseefs, delete base

---

## 13. Miscellaneous

### 13a. Pull-to-refresh on all list screens
- Verify SpacesListScreen, HaseefsListScreen, BasesListScreen, InvitationsListScreen all support pull-to-refresh

### 13b. Empty states
- Add proper empty state illustrations/messages for all list screens when data is empty

### 13c. Error states
- Show retry buttons on failed API calls instead of just error text

### 13d. Loading skeletons
- Replace plain `ActivityIndicator` with skeleton placeholders for better UX

### 13e. Haptic feedback
- Add `expo-haptics` for button presses, pull-to-refresh, etc.

### 13f. Keyboard avoiding
- Verify `KeyboardAvoidingView` works correctly on iOS/Android in chat input and all form screens

---

## Completion Summary

| # | Feature | Status |
|---|---------|--------|
| 1 | Theme & Colors | ✅ Done |
| 2 | Chat Header → Space Details | ✅ Done |
| 3 | Avatars in Chat | ✅ Done |
| 4 | Reply Auto-scroll | ✅ Done |
| 5 | Audio Playback | ⏭️ Deferred (expo-av still works) |
| 6 | Create Space Parity | ✅ Done |
| 7 | Space List Features | ⏭️ Partial (API-dependent) |
| 8 | Haseef Detail Actions | ✅ Done |
| 9 | Invite System | ✅ Done |
| 10 | Chat Features | ✅ Done |
| 11 | Profile / Settings | ⏭️ Blocked (no server endpoint) |
| 12 | Bases Parity | ✅ Done |
| 13 | Misc Polish | ⏭️ Ongoing |
