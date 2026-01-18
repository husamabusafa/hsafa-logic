# HSAFA Agent Builder - Integration Guide

## Overview

The HSAFA agent builder system has been successfully refactored to work with the new YAML-based agent configuration API. The system now uses a `.hsafa/agents` folder to store agent configurations and dynamically builds agents at runtime.

## Architecture

### Components Created/Updated

1. **Agent Builder API** (`lib/agent-builder/`)
   - `types.ts` - Zod schemas for YAML validation
   - `parser.ts` - YAML parsing and environment variable interpolation
   - `model-resolver.ts` - Model provider resolution (OpenAI)
   - `builder.ts` - Agent construction logic
   
2. **API Routes**
   - `/api/agent` - Main endpoint for agent execution (POST)
   - `/api/agent-config/[agentName]` - Load agent YAML configs (GET)

3. **SDK Updates** (`sdk/src/`)
   - Updated `HsafaChat` component to accept `agentName` and `agentConfig` props
   - Updated `useHsafaAgent` hook to work with new API
   - Created `useAgentConfig` hook for loading agent configs client-side
   - Updated transport to use `/api/agent` endpoint

4. **Configuration Storage**
   - `.hsafa/agents/` - Folder for agent YAML files
   - `.hsafa/agents/basic-chat.hsafa` - Example basic chat agent

## How It Works

### 1. Agent Configuration (`.hsafa/agents/{agentName}.hsafa`)

```yaml
version: "1.0"

agent:
  name: basic-chat
  description: Basic chat agent without tools.
  system: |
    You are a helpful assistant.
    Keep answers concise and friendly.

model:
  provider: openai
  name: gpt-4o-mini
  temperature: 0.7
  maxOutputTokens: 800

loop:
  maxSteps: 20

runtime:
  response:
    type: ui-message-stream
```

### 2. Client-Side Usage

```tsx
'use client';

import { HsafaChat } from '@/sdk/src/components/HsafaChat';
import { useAgentConfig } from '@/sdk/src/hooks/useAgentConfig';

export default function Page() {
  // Load agent config from server
  const { agentConfig, loading, error } = useAgentConfig('basic-chat');

  if (loading) return <div>Loading agent...</div>;
  if (error || !agentConfig) return <div>Error: {error?.message}</div>;

  return (
    <HsafaChat
      agentName="basic-chat"
      agentConfig={agentConfig}
      fullPageChat={true}
      theme="dark"
      title="My Agent"
      placeholder="Ask me anything..."
    />
  );
}
```

### 3. API Flow

1. **Client** calls `useAgentConfig('basic-chat')` hook
2. **Hook** fetches from `/api/agent-config/basic-chat`
3. **API** loads config from `.hsafa/agents/basic-chat.hsafa`
4. **Client** receives `agentConfig` string
5. **HsafaChat** passes `agentConfig` to `useHsafaAgent` hook
6. **useHsafaAgent** creates transport with `agentConfig` embedded
7. **On message send**, transport posts to `/api/agent` with:
   - `agentConfig` - The agent configuration
   - `messages` - Chat messages in UIMessage format
8. **API** parses config, builds ToolLoopAgent, streams response

## Key Changes from Old System

### Before (Old System)
- Used `agentId` to reference pre-deployed agents
- Agents were built/deployed separately
- API endpoint: `/api/run/{agentId}`

### After (New System)
- Uses `agentName` + `agentConfig` configuration
- Agents are built dynamically at request time
- API endpoint: `/api/agent`
- Agent configs stored in `.hsafa/agents/`

## Creating New Agents

1. Create a new YAML file in `.hsafa/agents/`:
   ```bash
   touch .hsafa/agents/my-agent.hsafa
   ```

2. Add your agent configuration:
   ```yaml
   version: "1.0"
   
   agent:
     name: my-agent
     description: My custom agent
     system: You are a helpful assistant specialized in...
   
   model:
     provider: openai
     name: gpt-4o-mini
     temperature: 0.7
   
   loop:
     maxSteps: 20
   ```

3. Use in your app:
   ```tsx
   const { agentConfig, loading, error } = useAgentConfig('my-agent');
   
   <HsafaChat
     agentName="my-agent"
     agentConfig={agentConfig}
     ...
   />
   ```

## Environment Variables

Set in `.env.local`:

```bash
OPENAI_API_KEY=sk-...
```

## Testing

1. **Start the dev server:**
   ```bash
   pnpm dev
   ```

2. **Visit** `http://localhost:3000`

3. **The app should:**
   - Load the basic-chat agent config
   - Display the chat interface
   - Allow you to send messages
   - Stream responses from the agent

4. **Test with curl:**
   ```bash
   curl -X POST http://localhost:3000/api/agent \
     -H "Content-Type: application/json" \
     -d '{
       "agentConfig": "version: \"1.0\"\n\nagent:\n  name: test\n  system: You are helpful.\n\nmodel:\n  provider: openai\n  name: gpt-4o-mini",
       "messages": [{"role": "user", "content": "Hello!"}]
     }'
   ```

## Next Steps

### Future Enhancements
1. **Tool Support** - Add HTTP tools, inline JS tools, registry tools
2. **MCP Integration** - Connect MCP servers for external tool capabilities
3. **Additional Providers** - Support Anthropic, Google, etc.
4. **Caching** - Cache parsed agent configs for better performance
5. **Validation UI** - Build a UI for creating/editing agent configs

### SDK Improvements
- Build and publish SDK package properly
- Add more examples and documentation
- Create agent templates
- Add agent preview/testing mode

## Troubleshooting

### "Agent config not found" error
- Ensure the `.hsafa/agents/{agentName}.hsafa` file exists
- Check the file has correct YAML syntax
- Verify the agentName matches the filename (without .hsafa extension)

### "OPENAI_API_KEY not set" error
- Create `.env.local` file in project root
- Add `OPENAI_API_KEY=your_key_here`
- Restart the dev server

### SDK import errors
- The SDK is imported directly from source (`@/sdk/src/...`)
- No build step required for development
- For production, consider building and publishing the SDK package

## File Structure

```
hsafa-logic/
├── .hsafa/
│   └── agents/
│       └── basic-chat.hsafa          # Agent configurations
├── app/
│   ├── api/
│   │   ├── agent/
│   │   │   └── route.ts              # Main agent execution endpoint
│   │   └── agent-config/
│   │       └── [agentName]/
│   │           └── route.ts          # Load agent configs
│   └── page.tsx                      # Example usage
├── lib/
│   ├── agent-builder/                # Core agent building logic
│   │   ├── types.ts
│   │   ├── parser.ts
│   │   ├── model-resolver.ts
│   │   └── builder.ts
│   └── utils/
│       └── load-agent-config.ts      # Server-side config loader
└── sdk/
    └── src/
        ├── components/
        │   └── HsafaChat.tsx         # Main chat component
        ├── hooks/
        │   ├── useHsafaAgent.ts      # Core agent hook
        │   └── useAgentConfig.ts     # Config loader hook
        └── types/
            └── chat.ts               # TypeScript types
```

## Summary

✅ Agent builder API fully functional
✅ YAML-based configuration system working
✅ SDK updated to use new API
✅ Example agent created and integrated
✅ Full streaming support
✅ Environment variable interpolation
✅ Error handling and validation

The system is ready for use! You can now create agents by adding YAML files to `.hsafa/agents/` and use them with the `HsafaChat` component.
