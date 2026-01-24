# AI Agent Tool

## Overview

Delegate tasks to other AI agents. Enables multi-agent systems where specialized agents handle specific domains.

## Purpose

- Route tasks to domain-specific agents (finance, legal, support, etc.)
- Build agent hierarchies (supervisor → workers)
- Chain multiple agents for complex workflows
- Run agents in parallel

## Input Schema

```json
{
  "agentId": "string",              // Target agent ID
  "prompt": "string",               // Task/message to send
  "context": {},                    // Optional context data
  "conversationHistory": [],        // Optional previous messages
  "timeout": 30000,                 // Optional timeout in ms
  "streaming": false                // Optional streaming response
}
```

## Examples

### Delegate to Specialist
```json
{
  "agentId": "finance-analyst",
  "prompt": "Analyze Q4 2024 profitability",
  "context": {
    "quarter": "Q4",
    "year": 2024
  }
}
```

### Support Escalation
```json
{
  "agentId": "tier2-support",
  "prompt": "Customer has authentication errors after password reset",
  "context": {
    "customerId": "CUST-123",
    "attemptedSolutions": ["password-reset", "cache-clear"]
  },
  "conversationHistory": [
    {"role": "user", "content": "I can't log in"},
    {"role": "assistant", "content": "Let's try resetting your password"}
  ]
}
```

### Parallel Execution
```json
// Call multiple agents simultaneously
[
  {"agentId": "sentiment-analyzer", "prompt": "Analyze reviews"},
  {"agentId": "trend-detector", "prompt": "Find trending topics"},
  {"agentId": "issue-classifier", "prompt": "Categorize complaints"}
]
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
