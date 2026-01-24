# Waiting Tool

## Overview

Pause agent execution for a specified duration. Useful for retry logic, rate limiting, and polling.

## Purpose

- Wait before retrying failed operations
- Respect API rate limits
- Control timing between workflow steps
- Poll status at intervals
- Delay until specific time

## Input Schema

```json
{
  "duration": 1000,               // Milliseconds (or use seconds/minutes/hours)
  "seconds": 5,                   // Alternative: seconds
  "minutes": 2,                   // Alternative: minutes  
  "hours": 1,                     // Alternative: hours
  "until": "2024-01-25T09:00:00Z", // Alternative: wait until timestamp
  "reason": "string"              // Optional: why waiting
}
```

## Examples

### Simple Delay
```json
{
  "seconds": 5,
  "reason": "Retry after failure"
}
```

### Rate Limiting
```json
{
  "duration": 1000,
  "reason": "API rate limit cooldown"
}
```

### Polling
```json
{
  "seconds": 30,
  "reason": "Check job status again"
}
```

### Wait Until Time
```json
{
  "until": "2024-01-25T09:00:00Z",
  "reason": "Wait for business hours"
}
```

### Exponential Backoff
```json
{
  "duration": 4000,              // 2^attempt * 1000
  "reason": "Exponential backoff attempt 2"
}
```

## Response Format

```json
{
  "success": true,
  "waited": 5000,                // Actual milliseconds waited
  "reason": "Retry after failure",
  "startTime": "2024-01-24T08:00:00Z",
  "endTime": "2024-01-24T08:00:05Z",
  "cancelled": false
}
```

## Common Patterns

### Retry with Backoff
```
Attempt 1: fail → wait 1s → Attempt 2: fail → wait 2s → Attempt 3: success
```

### Rate Limiting
```
Request 1 → wait 1s → Request 2 → wait 1s → Request 3
```

### Polling
```
Check status → wait 30s → Check status → wait 30s → Complete
```

## Best Practices

1. Always provide a `reason` for debugging
2. Avoid excessively long waits
3. Set maximum wait times
4. Use exponential backoff for retries
5. Use UTC timestamps for `until` parameter


## Notes

- Essential for retry logic and polling
- Prevents API rate limit violations
- Use judiciously to avoid delays
- Can be cancelled via abort signal
- Specify time in duration/seconds/minutes/hours or exact timestamp with `until`
