# Adding Tools to Agent Config

## Overview

Tools are defined in the agent configuration JSON. Each tool has a name, standard Vercel AI SDK properties, and an execution type that determines how it runs.

## Tool Structure

```json
{
  "name": "string",
  "description": "string",
  "inputSchema": {},
  "executionType": "basic|request|ai-agent|waiting|compute|image-generator",
  "execution": {}
}
```

## Properties

### Standard Properties (from Vercel AI SDK)

- **`name`** (required) - Unique tool identifier
- **`description`** (optional) - What the tool does, helps LLM decide when to use it
- **`inputSchema`** (required) - JSON schema defining input parameters

### Hsafa Logic Properties

- **`executionType`** (required) - Type of execution
- **`execution`** (optional) - Configuration specific to the execution type

## Execution Types

### 1. `basic`
No backend execution logic. Executes on frontend.

**Execution config:**
```json
{
  "mode": "no-execution|static|pass-through",
  "output": {},      // For static mode
  "template": false  // For static mode with variables
}
```

**If `execution` is null:** Uses no-execution mode (gets response from frontend via `addToolResult`)

### 2. `request`
Make HTTP requests to external APIs.

**Execution config:**
```json
{
  "url": "string",
  "method": "GET|POST|PUT|DELETE|PATCH",
  "headers": {},
  "timeout": 30000
}
```

### 3. `ai-agent`
Delegate tasks to other AI agents.

**Execution config:**
```json
{
  "agentId": "string",
  "timeout": 30000
}
```

### 4. `waiting`
Pause execution for a duration.

**Execution config:**
```json
{
  "duration": 1000,
  "reason": "string"
}
```

### 5. `compute`
Perform safe logic and calculations on data.

**Execution config:**
```json
{
  "operation": "string",
  "expression": "string"
}
```

### 6. `image-generator`
Generate images from text prompts.

**Execution config:**
```json
{
  "provider": "dall-e|stable-diffusion",
  "size": "1024x1024",
  "quality": "standard|hd"
}
```

## Examples

### Basic Tool (No Execution)
```json
{
  "name": "getUserApproval",
  "description": "Request user approval for an action",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": {"type": "string"},
      "amount": {"type": "number"}
    },
    "required": ["action"]
  },
  "executionType": "basic",
  "execution": null
}
```
Uses default no-execution mode, gets response from frontend.

### Basic Tool (Static)
```json
{
  "name": "getStatus",
  "description": "Get current status",
  "inputSchema": {
    "type": "object",
    "properties": {}
  },
  "executionType": "basic",
  "execution": {
    "mode": "static",
    "output": {"status": "ACTIVE", "ready": true}
  }
}
```

### Request Tool
```json
{
  "name": "fetchUserData",
  "description": "Fetch user data from API",
  "inputSchema": {
    "type": "object",
    "properties": {
      "userId": {"type": "string"}
    },
    "required": ["userId"]
  },
  "executionType": "request",
  "execution": {
    "url": "https://api.example.com/users/{{userId}}",
    "method": "GET",
    "headers": {
      "Authorization": "Bearer {{apiKey}}"
    }
  }
}
```

### AI Agent Tool
```json
{
  "name": "analyzeFinancials",
  "description": "Analyze financial data using specialized agent",
  "inputSchema": {
    "type": "object",
    "properties": {
      "quarter": {"type": "string"},
      "year": {"type": "number"}
    },
    "required": ["quarter", "year"]
  },
  "executionType": "ai-agent",
  "execution": {
    "agentId": "finance-analyst"
  }
}
```

### Waiting Tool
```json
{
  "name": "waitBeforeRetry",
  "description": "Wait before retrying an operation",
  "inputSchema": {
    "type": "object",
    "properties": {
      "seconds": {"type": "number"}
    }
  },
  "executionType": "waiting",
  "execution": null
}
```
Duration specified in tool input, not execution config.

### Compute Tool
```json
{
  "name": "calculateProfit",
  "description": "Calculate profit margin",
  "inputSchema": {
    "type": "object",
    "properties": {
      "revenue": {"type": "number"},
      "costs": {"type": "number"}
    },
    "required": ["revenue", "costs"]
  },
  "executionType": "compute",
  "execution": {
    "operation": "calculate",
    "expression": "(revenue - costs) / revenue * 100"
  }
}
```

### Image Generator Tool
```json
{
  "name": "createProductImage",
  "description": "Generate product images from description",
  "inputSchema": {
    "type": "object",
    "properties": {
      "prompt": {"type": "string"}
    },
    "required": ["prompt"]
  },
  "executionType": "image-generator",
  "execution": {
    "provider": "dall-e",
    "size": "1024x1024",
    "quality": "hd"
  }
}
```

## Notes

- **Standard Vercel AI SDK structure** - Compatible with `description`, `inputSchema`
- **`execution` property** - Hsafa Logic extension for backend execution configuration
- **Null execution** - Valid for basic tool (defaults to no-execution mode) and tools where config comes from input
- **Variable substitution** - Use `{{variableName}}` in execution config (e.g., URLs, headers)
- **Type safety** - Use JSON schema for `inputSchema` validation
