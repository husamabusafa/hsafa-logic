# Request Tool

## Overview

Make HTTP requests to external APIs and services. Supports dynamic variable substitution using `{{variable}}` syntax.

## Purpose

- Call external APIs (REST, GraphQL, etc.)
- Send webhooks to other systems
- Fetch or submit data to external services
- Integrate with third-party platforms

## Input Schema

```json
{
  "url": "string",              // URL with {{variable}} support
  "method": "GET|POST|PUT|PATCH|DELETE",
  "headers": {},                // Optional headers with {{variable}} support
  "queryParams": {},            // Optional query parameters
  "body": {},                   // Optional request body
  "timeout": 30000,             // Optional timeout in ms
  "variables": {}               // Values for {{variable}} replacement
}
```

## Examples

### GET Request
```json
{
  "url": "https://api.example.com/users/{{userId}}",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer {{token}}"
  },
  "variables": {
    "userId": "123",
    "token": "abc123"
  }
}
```

### POST Request
```json
{
  "url": "https://api.crm.com/tickets",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer {{apiKey}}"
  },
  "body": {
    "title": "{{title}}",
    "priority": "high"
  },
  "variables": {
    "apiKey": "secret_key",
    "title": "System Alert"
  }
}
```

### Webhook
```json
{
  "url": "{{webhookUrl}}",
  "method": "POST",
  "body": {
    "event": "order.completed",
    "orderId": "{{orderId}}"
  },
  "variables": {
    "webhookUrl": "https://hooks.example.com/events",
    "orderId": "ORD-123"
  }
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
