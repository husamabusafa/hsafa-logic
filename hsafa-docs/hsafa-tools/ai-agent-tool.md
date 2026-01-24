# AI Agent Tool

## Overview

Delegate tasks to other AI agents. Enables multi-agent systems where specialized agents handle specific domains.

## Purpose

- Route tasks to domain-specific agents (finance, legal, support, etc.)
- Build agent hierarchies (supervisor → workers)
- Chain multiple agents for complex workflows
- Run agents in parallel

## Execution Property

In agent config, use the `execution` property to specify the target agent:

```json
{
  "agentId": "string",              // Target agent ID
  "timeout": 30000                  // Optional timeout in ms
}
```

## Input Schema

```json
{
  "prompt": "string",               // Task/message to send
  "context": {},                    // Optional context data
  "conversationHistory": []         // Optional previous messages
}
```

## Agent Config Example

```json
{
  "name": "analyzeFinancials",
  "description": "Analyze financial data using specialized agent",
  "inputSchema": {
    "type": "object",
    "properties": {
      "prompt": {"type": "string"},
      "quarter": {"type": "string"},
      "year": {"type": "number"}
    },
    "required": ["prompt"]
  },
  "executionType": "ai-agent",
  "execution": {
    "agentId": "finance-analyst",
    "timeout": 30000
  }
}
```

## Examples

### Delegate to Specialist
```json
// Agent calls:
{
  "prompt": "Analyze Q4 2024 profitability",
  "context": {
    "quarter": "Q4",
    "year": 2024
  }
}

// Delegates to finance-analyst agent
```

### Support Escalation
```json
// Agent config execution:
{
  "agentId": "tier2-support"
}

// Agent calls:
{
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
// Define multiple AI agent tools, agent calls them in parallel
// Tool 1: sentiment-analyzer agent
// Tool 2: trend-detector agent  
// Tool 3: issue-classifier agent
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
