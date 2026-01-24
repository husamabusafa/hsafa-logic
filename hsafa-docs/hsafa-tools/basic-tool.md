# Basic Tool

## Overview

A flexible tool with no backend execution logic. Can get responses from frontend via `addToolResult`, return static responses, or pass through input as output.

## Purpose

- **Execute on frontend with response** - Display UI, call functions, get results (default)
- **Execute without response** - Display UI, call functions, no response needed
- **Return static responses** - Predefined outputs
- **Pass through data** - Echo input as output

All modes can display UI and call functions - the difference is **how the response is handled**.

## Three Modes

### 1. No Execution Mode (Default)
**No backend execution logic.** The tool executes on the frontend and **gets response via `addToolResult`**.

**Can be used for:**
- Display UI → Get response (user interaction, fetch result, computed value)
- Call function → Get return value
- Any frontend operation → Get result back

```json
// Example: UI that fetches data and returns it
{
  "action": "showWeather",
  "location": "New York"
}
// Frontend displays weather UI, fetches data
// Returns via addToolResult:
{
  "temperature": 72,
  "condition": "sunny"
}
```

```json
// Example: Function call with response
{
  "action": "getUserLocation"
}
// Frontend executes function
// Returns via addToolResult:
{
  "latitude": 40.7128,
  "longitude": -74.0060
}
```

### 2. Static Response Mode
Return predefined output configured in the tool definition. **Frontend can still display UI or call functions**, but response is the configured static output.

**Can be used for:**
- Display UI → Return static response (UI shows, but response is predefined)
- Call function → Return static response (function runs, but response is predefined)
- Any frontend operation → Ignore actual result, return static output

```json
// Tool Configuration:
{
  "mode": "static",
  "output": {"status": "SUCCESS", "message": "Completed"}
}

// Agent calls with UI display:
{"action": "showNotification", "message": "Done"}
// UI displays, but always returns:
{"status": "SUCCESS", "message": "Completed"}
```

### 3. Pass-Through Mode
Agent's input becomes the tool output. **Frontend can still display UI or call functions**, but response is the input data.

**Can be used for:**
- Display UI → Return input (UI shows, response is original input)
- Call function → Return input (function runs, response is original input)
- Any frontend operation → Ignore actual result, return input as-is

```json
// Agent calls with UI display:
{
  "action": "showNotification",
  "message": "Order confirmed"
}
// UI displays, returns immediately:
{
  "action": "showNotification",
  "message": "Order confirmed"
}
```

```json
// Agent calls function:
{
  "action": "highlightElement",
  "selector": "#status"
}
// Function executes, returns immediately:
{
  "action": "highlightElement",
  "selector": "#status"
}
```

## Input Schema

```json
{
  "mode": "no-execution|static|pass-through",  // Optional: defaults to no-execution
  "outputId": "string",                        // Optional: for static mode
  "variables": {},                             // Optional: for template replacement
  "action": "string",                          // Action name (UI display, function call, etc.)
  // ... any other data needed for the action
}
```

## Configuration

```json
{
  "mode": "no-execution|static|pass-through",  // Default: no-execution
  "output": {},                                // For static mode
  "template": false                            // Enable {{variable}} in static mode
}
```

## Examples

### No Execution - UI with User Input
```json
// Agent calls:
{
  "action": "requestApproval",
  "amount": 15000
}

// Frontend displays approval UI, user interacts
// addToolResult sends:
{
  "approved": true,
  "timestamp": "2024-01-24T08:00:00Z"
}
```

### No Execution - UI with Data Fetch
```json
// Agent calls:
{
  "action": "showProductDetails",
  "productId": "ABC123"
}

// Frontend displays UI, fetches product data
// addToolResult sends:
{
  "name": "Widget Pro",
  "price": 99.99,
  "stock": 42
}
```

### No Execution - Function Call
```json
// Agent calls:
{
  "action": "calculateDistance",
  "from": "New York",
  "to": "Boston"
}

// Frontend executes function
// addToolResult sends:
{
  "distance": 215,
  "unit": "miles"
}
```

### Static - UI Display with Fixed Response
```json
// Tool config:
{
  "mode": "static",
  "output": {"status": "PENDING", "message": "Processing"}
}

// Agent calls to show UI:
{"action": "showLoader", "text": "Please wait..."}
// UI displays, but returns static output:
{"status": "PENDING", "message": "Processing"}
```

### Static with Template
```json
// Tool config:
{
  "mode": "static",
  "output": {"trackingId": "ORD-{{orderId}}"},
  "template": true
}

// Agent calls:
{"variables": {"orderId": "12345"}}

// Returns:
{"trackingId": "ORD-12345"}
```

### Pass-Through - UI Display
```json
// Agent calls:
{
  "action": "showSuccess",
  "message": "Payment received"
}

// UI displays, returns input immediately:
{
  "action": "showSuccess",
  "message": "Payment received"
}
```

### Pass-Through - Function Call
```json
// Agent calls:
{
  "action": "logEvent",
  "event": "checkout_complete",
  "value": 150
}

// Function executes, returns input immediately:
{
  "action": "logEvent",
  "event": "checkout_complete",
  "value": 150
}
```

## Response Format

### No Execution Mode
```json
{
  "success": true,
  "output": {},                    // Response from frontend via addToolResult
  "mode": "no-execution"
}
```

### Static Mode
```json
{
  "success": true,
  "output": {},                    // Configured static output
  "mode": "static"
}
```

### Pass-Through Mode
```json
{
  "success": true,
  "output": {},                    // Same as agent input
  "mode": "pass-through"
}
```

## When to Use Each Mode

### No Execution (Default)
**Use when you need response from the frontend operation:**

**For UI:**
- User interaction needed (forms, approvals)
- UI fetches data and returns it
- UI computes something and returns result

**For Functions:**
- Function returns computed values
- Function fetches external data
- Any operation where you need the result

**Pattern:** "Request and wait for response"

### Static Response
**Use when you want fixed output regardless of what happens on frontend:**

**For UI:**
- Display UI but return predefined status
- Show loading state with constant response

**For Functions:**
- Execute function but return fixed output
- Trigger action but return standard response

**Pattern:** "Execute but ignore result, return configured output"

### Pass-Through
**Use when you don't need the frontend operation's response:**

**For UI:**
- Display-only notifications
- Show messages without waiting for interaction

**For Functions:**
- Fire-and-forget logging
- Trigger analytics events
- Highlight/modify DOM elements

**Pattern:** "Fire and forget, return input"

## Built-in Frontend Tools

When using **no-execution mode**, the SDK provides built-in tools:

- **`getDomComponents`** - Get DOM elements
- **`controlCursor`** - Move and click elements
- **`fillActiveInput`** - Fill focused input
- **`requestInput`** - Request user input via form

All built-in tools use `addToolResult` to send responses back to the agent.

## Frontend Implementation

Register your frontend actions (functions and UI) in the SDK:

```tsx
import { HsafaChat } from '@hsafa/ui-sdk';

const tools = {
  // Function that returns data (no-execution mode)
  calculateDistance: async ({ from, to }) => {
    const result = await getDistance(from, to);
    return { distance: result, unit: 'miles' };
  },
  
  // Function that just executes (pass-through/static modes)
  logEvent: async ({ event, value }) => {
    analytics.track(event, { value });
    return { logged: true };
  },
  
  // UI that collects input (no-execution mode)
  requestApproval: async ({ amount }) => {
    // Render UI, wait for user, return choice
    return { approved: true };
  },
  
  // UI that displays info (any mode)
  showSuccess: async ({ message }) => {
    // Render success message
    return { displayed: true };
  }
};

<HsafaChat agentId="my-agent" HsafaTools={tools} />
```

## Tool Definition in Agent Config

```json
{
  "name": "basicTool",
  "description": "Execute frontend operations (UI display, function calls, etc.) with configurable response handling",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "description": "Action to perform (e.g., showWeather, calculateDistance, logEvent)"
      },
      "mode": {
        "type": "string",
        "enum": ["no-execution", "static", "pass-through"],
        "description": "Response handling mode (default: no-execution)"
      }
    },
    "required": ["action"]
  }
}
```

**Note:** No `execute` function in agent config. Execution happens:
- **No-execution mode**: On frontend via HsafaTools/HsafaUI, response via `addToolResult`
- **Static mode**: Returns configured output immediately
- **Pass-through mode**: Returns input immediately

## Best Practices

1. **Use default mode** for interactive operations that need responses
2. **Use pass-through** for display-only UI or fire-and-forget functions
3. **Use static** for fixed responses and workflow endpoints
4. **Match names** between agent config and HsafaTools/HsafaUI
5. **Type safety** with TypeScript for function parameters
6. **Handle errors** gracefully in frontend functions

## Key Insight

**All three modes can:**
- Display UI
- Call frontend functions
- Perform any frontend operation

**The difference is the response:**
- **No Execution:** Returns response from frontend via `addToolResult`
- **Static:** Returns configured static output (ignores frontend result)
- **Pass-Through:** Returns input data (ignores frontend result)

## Comparison with Previous Tools

This Basic Tool **replaces**:

### Frontend Tool → No Execution Mode
- Gets responses from frontend operations
- UI can return user input, fetched data, or computed values
- Functions return their results
- Uses `addToolResult`

### Static Output Tool → Static + Pass-Through Modes
- Static: Frontend executes, returns fixed output
- Pass-through: Frontend executes, returns input

## Notes

- **Default mode**: No execution (waits for frontend response)
- **No backend logic**: All execution happens on frontend or returns static/input data
- **Flexible**: Three modes cover all use cases
- **Simple**: One tool instead of multiple specialized tools
- Frontend tools have **no execute function** in agent configuration
- Response mechanism varies by mode: `addToolResult`, static config, or input echo
