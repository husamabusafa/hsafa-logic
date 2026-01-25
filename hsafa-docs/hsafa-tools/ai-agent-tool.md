# AI Agent Tool

## Overview

Delegate tasks to other AI agents. Enables multi-agent systems where specialized agents handle specific domains.

## Purpose

- Route tasks to domain-specific agents (finance, legal, support, etc.)
- Build agent hierarchies (supervisor → workers)
- Chain multiple agents for complex workflows
- Run agents in parallel

## Execution Property

In agent config, use the `execution` property to define the agent configuration:

```json
{
  "agentConfig": {                  // Complete agent configuration
    "name": "string",
    "model": "string",
    "systemPrompt": "string",
    "tools": [],
    "temperature": 0.7
  },
  "includeContext": false,          // Optional: pass message context to agent (default: false)
  "timeout": 30000                  // Optional timeout in ms
}
```

**Options:**
- **`includeContext: false`** (default) - Agent only receives the prompt
- **`includeContext: true`** - Agent receives full message history/context

**Note:** This tool has a default `prompt` inputSchema that is automatically provided. Do not add `inputSchema` manually.

## Agent Config Example

### Without Context (Default)
```json
{
  "name": "analyzeFinancials",
  "description": "Analyze financial data using specialized agent",
  "executionType": "ai-agent",
  "execution": {
    "agentConfig": {
      "name": "finance-analyst",
      "model": "gpt-4",
      "systemPrompt": "You are a financial analyst specialized in profitability analysis. Analyze the data provided and give actionable insights.",
      "tools": [],
      "temperature": 0.3
    },
    "includeContext": false,
    "timeout": 30000
  }
}
```
Agent only sees the prompt, no previous messages.

### With Context
```json
{
  "name": "supportEscalation",
  "description": "Escalate to specialized support agent",
  "executionType": "ai-agent",
  "execution": {
    "agentConfig": {
      "name": "tier2-support",
      "model": "gpt-4",
      "systemPrompt": "You are a Tier 2 support specialist.",
      "tools": []
    },
    "includeContext": true
  }
}
```
Agent sees full conversation history for better context.

**Note:** Default `prompt` inputSchema is automatic - do not add manually.

## Examples

### Delegate to Specialist
```json
// Main agent decides to use the tool
// The finance-analyst agent (defined in execution.agentConfig) receives:
// "Analyze Q4 2024 profitability based on the data provided"

// The inline agent executes with its systemPrompt and returns analysis
```

### Support Escalation
```json
// Agent config execution:
{
  "agentConfig": {
    "name": "tier2-support",
    "model": "gpt-4",
    "systemPrompt": "You are a Tier 2 technical support specialist. Handle escalated issues with deep technical knowledge.",
    "tools": ["checkSystemLogs", "resetUserSession"]
  }
}

// Main agent decides to escalate, tier2-support agent receives context from conversation
```

### Parallel Execution
```json
// Define multiple AI agent tools with different agentConfigs
// Tool 1: sentiment-analyzer (configured for sentiment analysis)
// Tool 2: trend-detector (configured for trend detection)
// Tool 3: issue-classifier (configured for issue classification)

// Main agent can call all three in parallel
```

## Response Format

```json
{
  "success": true,
  "agentId": "finance-analyst",
  "response": "text response from agent",
  "data": {},                       // Optional structured data
  "conversationId": "conv-123",
  "duration": 2500
}
```

## Common Patterns

### Supervisor Pattern
```
Main Agent → [Finance, Legal, Operations, HR]
```

### Pipeline Pattern
```
Agent A → Agent B → Agent C
```

### Router Pattern
```
Main Agent → Routes to appropriate specialist
```

## Best Practices

1. Provide clear, specific tasks
2. Pass only relevant context
3. Set appropriate timeouts
4. Handle agent failures gracefully
5. Prevent infinite loops (set max depth)

## Notes

- Each agent maintains its own specialization
- Useful for breaking complex tasks into subtasks
- Supports parallel execution of multiple agents
- Track agent interactions for debugging
