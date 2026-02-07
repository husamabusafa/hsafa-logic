# @hsafa/ui

Prebuilt chat UI components for Hsafa — drop-in chat powered by `@assistant-ui/react` and `@hsafa/react-sdk`.

## Installation

```bash
pnpm add @hsafa/ui @hsafa/react-sdk @assistant-ui/react
```

## Quick Start — One-Liner Chat

```tsx
import { HsafaChat } from '@hsafa/ui';

function App() {
  return (
    <HsafaChat
      gatewayUrl="http://localhost:3001"
      publicKey="pk_..."
      jwt={userToken}
      entityId={userId}
      smartSpaceId={spaceId}
      style={{ height: '600px' }}
    />
  );
}
```

## Floating Modal Chat

```tsx
import { HsafaModal } from '@hsafa/ui';

function App() {
  return (
    <HsafaModal
      gatewayUrl="http://localhost:3001"
      publicKey="pk_..."
      jwt={userToken}
      entityId={userId}
      smartSpaceId={spaceId}
      width="400px"
      height="500px"
    />
  );
}
```

## Composable Usage

For more control, use the provider and thread separately:

```tsx
import { HsafaChatProvider, HsafaThread } from '@hsafa/ui';

function App() {
  return (
    <HsafaChatProvider
      gatewayUrl="http://localhost:3001"
      publicKey="pk_..."
      jwt={userToken}
      entityId={userId}
      smartSpaceId={spaceId}
    >
      <div style={{ height: '100vh' }}>
        <HsafaThread
          welcomeMessage="Ask me anything!"
          placeholder="Type here…"
        />
      </div>
    </HsafaChatProvider>
  );
}
```

## Components

| Component | Description |
|-----------|-------------|
| `<HsafaChat>` | All-in-one: provider + thread in a single component |
| `<HsafaModal>` | Floating modal chat with trigger button |
| `<HsafaChatProvider>` | Provider only — wraps auth, runtime, and members context |
| `<HsafaThread>` | Prebuilt thread UI (messages + composer) — use inside provider |

## Hooks

| Hook | Description |
|------|-------------|
| `useHsafaChatRuntime()` | Creates an `AssistantRuntime` from `@hsafa/react-sdk` data |
| `useMembers()` | Access members context (membersById, currentEntityId) |

## Architecture

```
@hsafa/ui
  └── @hsafa/react-sdk        (data layer: client, hooks, SSE)
  └── @assistant-ui/react      (UI primitives: Thread, Composer, Message)
```

- **`@hsafa/react-sdk`** handles all gateway communication (REST + SSE streaming)
- **`@hsafa/ui`** bridges the data into `@assistant-ui/react` primitives and provides prebuilt components
