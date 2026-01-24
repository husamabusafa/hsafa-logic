# Request Tool

## Overview

Make HTTP requests to external APIs and services. Supports dynamic variable substitution using `{{variable}}` syntax.

## Purpose

- Call external APIs (REST, GraphQL, etc.)
- Send webhooks to other systems
- Fetch or submit data to external services
- Integrate with third-party platforms

## Execution Property

In agent config, use the `execution` property to configure the HTTP request:

```json
{
  "url": "string",              // URL with {{variable}} support
  "method": "GET|POST|PUT|PATCH|DELETE",
  "headers": {},                // Optional headers with {{variable}} support
  "queryParams": {},            // Optional query parameters
  "body": {},                   // Optional request body
  "timeout": 30000              // Optional timeout in ms
}
```

## Input Schema

```json
{
  "variables": {}               // Values for {{variable}} replacement in execution config
  // ... any additional data for the request
}
```

## Agent Config Example

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

## Examples

### GET Request
```json
// Agent calls:
{
  "userId": "123",
  "variables": {"apiKey": "abc123"}
}

// Request sent:
// GET https://api.example.com/users/123
// Headers: Authorization: Bearer abc123
```

### POST Request
```json
// Agent config execution:
{
  "url": "https://api.crm.com/tickets",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer {{apiKey}}"
  },
  "body": {
    "title": "{{title}}",
    "priority": "high"
  }
}

// Agent calls:
{
  "title": "System Alert",
  "variables": {"apiKey": "secret_key"}
}
```

### Webhook
```json
// Agent config execution:
{
  "url": "{{webhookUrl}}",
  "method": "POST",
  "body": {
    "event": "order.completed",
    "orderId": "{{orderId}}"
  }
}

// Agent calls:
{
  "orderId": "ORD-123",
  "variables": {"webhookUrl": "https://hooks.example.com/events"}
}
```

## Response Format

```json
{
  "success": true,
  "status": 200,
  "data": {},                   // Parsed response body
  "headers": {},
  "error": "error message"      // If failed
}
```

## Best Practices

1. Use variables for sensitive data (API keys, tokens)
2. Set reasonable timeouts
3. Handle errors gracefully
4. Respect API rate limits

## Notes

- Variables use `{{variableName}}` syntax
- Supports all standard HTTP methods
- Template replacement happens in: url, headers, queryParams, body
