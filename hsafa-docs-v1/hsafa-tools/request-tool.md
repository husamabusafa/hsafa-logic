# Request Tool

## Overview

Make HTTP requests to any external URL — REST APIs, GraphQL endpoints, webhooks, or any HTTP service. Supports dynamic `{{variable}}` interpolation in URLs, headers, query params, and request bodies.

## Purpose

- **REST APIs** — GET, POST, PUT, PATCH, DELETE to any endpoint
- **GraphQL** — Send queries and mutations to GraphQL servers
- **Webhooks** — Fire events to external services
- **Any HTTP service** — Fetch data, submit forms, trigger actions

## Execution Property

```json
{
  "url": "string",
  "method": "GET|POST|PUT|PATCH|DELETE",
  "headers": {},
  "queryParams": {},
  "body": {},
  "timeout": 30000
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `url` | string | Yes | Request URL. Supports `{{variable}}` interpolation |
| `method` | string | Yes | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| `headers` | object | No | HTTP headers. Supports `{{variable}}` interpolation |
| `queryParams` | object | No | URL query parameters (appended to URL) |
| `body` | any | No | Request body (JSON). For `POST`/`PUT`/`PATCH`. If omitted, the agent's full input is used as the body |
| `timeout` | number | No | Request timeout in milliseconds. Default: `30000` (30s) |

## Variable Interpolation

All fields support `{{variableName}}` syntax. Variables are resolved from:
1. Top-level properties in the agent's input
2. The `variables` object in the input (merged, takes priority)

```json
// Agent input:
{
  "userId": "123",
  "variables": { "apiKey": "secret_token" }
}

// Both {{userId}} and {{apiKey}} are available in the execution config
```

## Agent Config Examples

### REST API — GET
```json
{
  "name": "fetchTodo",
  "description": "Fetch a todo item from the API",
  "inputSchema": {
    "type": "object",
    "properties": {
      "todoId": { "type": "number", "description": "The todo ID to fetch" }
    },
    "required": ["todoId"]
  },
  "executionType": "request",
  "execution": {
    "url": "https://jsonplaceholder.typicode.com/todos/{{todoId}}",
    "method": "GET"
  }
}
```

### REST API — POST
```json
{
  "name": "createTicket",
  "description": "Create a support ticket",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "body": { "type": "string" },
      "priority": { "type": "string", "enum": ["low", "medium", "high"] }
    },
    "required": ["title", "body"]
  },
  "executionType": "request",
  "execution": {
    "url": "https://api.example.com/tickets",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer {{apiKey}}"
    },
    "body": {
      "title": "{{title}}",
      "body": "{{body}}",
      "priority": "{{priority}}"
    }
  }
}
```

### GraphQL Query
```json
{
  "name": "searchUsers",
  "description": "Search users via GraphQL",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Search query" },
      "limit": { "type": "number", "description": "Max results" }
    },
    "required": ["query"]
  },
  "executionType": "request",
  "execution": {
    "url": "https://api.example.com/graphql",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer {{apiKey}}",
      "Content-Type": "application/json"
    },
    "body": {
      "query": "query SearchUsers($q: String!, $limit: Int) { users(search: $q, first: $limit) { id name email } }",
      "variables": {
        "q": "{{query}}",
        "limit": "{{limit}}"
      }
    }
  }
}
```

### GraphQL Mutation
```json
{
  "name": "createUser",
  "description": "Create a new user via GraphQL",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "email": { "type": "string" }
    },
    "required": ["name", "email"]
  },
  "executionType": "request",
  "execution": {
    "url": "https://api.example.com/graphql",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer {{apiKey}}"
    },
    "body": {
      "query": "mutation CreateUser($input: CreateUserInput!) { createUser(input: $input) { id name } }",
      "variables": {
        "input": {
          "name": "{{name}}",
          "email": "{{email}}"
        }
      }
    }
  }
}
```

### Webhook
```json
{
  "name": "sendWebhook",
  "description": "Send a webhook event to an external service",
  "inputSchema": {
    "type": "object",
    "properties": {
      "event": { "type": "string" },
      "payload": { "type": "object" }
    },
    "required": ["event"]
  },
  "executionType": "request",
  "execution": {
    "url": "https://hooks.example.com/events",
    "method": "POST",
    "headers": {
      "X-Webhook-Secret": "{{webhookSecret}}"
    }
  }
}
```

**Note:** When `body` is omitted for POST/PUT/PATCH, the agent's full input object is sent as the request body.

### With Query Parameters
```json
{
  "name": "searchProducts",
  "description": "Search products with filters",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "category": { "type": "string" },
      "maxPrice": { "type": "number" }
    },
    "required": ["query"]
  },
  "executionType": "request",
  "execution": {
    "url": "https://api.store.com/products",
    "method": "GET",
    "queryParams": {
      "q": "{{query}}",
      "category": "{{category}}",
      "max_price": "{{maxPrice}}"
    },
    "headers": {
      "X-API-Key": "{{apiKey}}"
    }
  }
}
```

## Response Format

```json
{
  "success": true,
  "status": 200,
  "data": {},
  "headers": {}
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | `true` if HTTP status is 2xx |
| `status` | number | HTTP status code |
| `data` | any | Parsed response body (JSON if `Content-Type: application/json`, otherwise string) |
| `headers` | object | Response headers |

## Best Practices

1. **Use `{{variables}}` for secrets** — never hardcode API keys in URLs or bodies
2. **Set reasonable timeouts** — default is 30s, reduce for fast APIs
3. **Use specific inputSchema** — guide the agent on what parameters to provide
4. **Omit `body` for simple POST** — the agent's input is used automatically
5. **GraphQL: use the `variables` pattern** — cleaner than string interpolation in queries
6. **Content-Type is automatic** — `application/json` is always set; override in `headers` if needed

## Notes

- `{{variable}}` interpolation works in: `url`, `headers`, `queryParams`, `body`
- `Content-Type: application/json` is set by default on all requests
- For `GET` requests, `body` is ignored
- Response is auto-parsed as JSON when the server returns `Content-Type: application/json`
- The `variables` object in agent input is merged with top-level properties for interpolation
