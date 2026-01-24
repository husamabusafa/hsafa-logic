# Compute Tool (Logic Tool)

## Overview

Perform safe logic and calculations on data. No external calls or arbitrary code execution - only structured expressions.

## Purpose

- Evaluate conditions and make decisions
- Validate data against rules
- Transform and format data
- Perform calculations and aggregations
- Calculate scores and rankings

## Execution Property

In agent config, use the `execution` property to pre-configure operation and expression:

```json
{
  "operation": "string",          // Type of operation
  "expression": "string"          // Optional: expression to evaluate
}
```

## Input Schema

```json
{
  "data": {},                     // Input data
  "rules": [],                    // Optional: validation/decision rules
  "parameters": {}                // Optional: additional parameters
}
```

## Operations

**Logic:** `if-then-else`, `all-of`, `any-of`  
**Validation:** `validate-schema`, `validate-range`, `validate-rules`  
**Transform:** `map`, `filter`, `extract`, `format`  
**Math:** `calculate`, `aggregate`, `round`  
**Scoring:** `score`, `rank`, `normalize`

## Agent Config Example

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

## Examples

### Conditional Logic
```json
// Agent config execution:
{
  "operation": "if-then-else",
  "expression": "amount > 10000 ? 'director-approval' : 'auto-approved'"
}

// Agent calls:
{
  "data": {"amount": 5000, "userRole": "manager"}
}
```

### Score Calculation
```json
// Agent config execution:
{
  "operation": "score"
}

// Agent calls:
{
  "data": {"creditScore": 720, "income": 75000, "debtRatio": 0.35},
  "rules": [
    {"field": "creditScore", "weight": 0.4, "scoring": {">=700": 80, "<700": 40}},
    {"field": "debtRatio", "weight": 0.6, "scoring": {"<=0.4": 70, ">0.4": 30}}
  ]
}
```

### Validation
```json
// Agent config execution:
{
  "operation": "validate-rules"
}

// Agent calls:
{
  "data": {"age": 25, "email": "user@example.com"},
  "rules": [
    {"field": "age", "operator": ">=", "value": 18},
    {"field": "email", "operator": "matches", "value": "email-format"}
  ]
}
```

### Calculation
```json
// Agent config execution:
{
  "operation": "calculate",
  "expression": "(revenue - costs) / revenue * 100"
}

// Agent calls:
{
  "data": {"revenue": 1000000, "costs": 650000}
}

// Returns: 35 (profit margin percentage)
```

### Aggregation
```json
// Agent config execution:
{
  "operation": "aggregate"
}

// Agent calls:
{
  "data": [
    {"product": "A", "sales": 1000},
    {"product": "B", "sales": 1500}
  ],
  "parameters": {"operation": "sum", "field": "sales"}
}

// Returns: 2500
```

## Response Format

```json
{
  "success": true,
  "result": {},                  // Computation result
  "operation": "calculate",
  "metadata": {
    "executionTime": 5
  }
}
```

## Expression Language

Supports safe expressions with:
- **Operators:** `+`, `-`, `*`, `/`, `==`, `!=`, `<`, `>`, `>=`, `<=`, `&&`, `||`, `!`
- **Ternary:** `condition ? true : false`
- **Functions:** `round()`, `sum()`, `avg()`, `min()`, `max()`

**Examples:**
```
"price * quantity * (1 - discount / 100)"
"age >= 18 ? 'adult' : 'minor'"
"round(amount * 1.15, 2)"
```

## Best Practices

1. Keep expressions simple and readable
2. Validate data before computation
3. Handle edge cases (division by zero, null values)
4. Test with various inputs

## Security

- No arbitrary code execution
- No file system or network access
- Only structured expressions allowed
- All operations logged

## Notes

- Safe alternative to arbitrary code execution
- Deterministic - same input = same output
- Fast local computation
- No external API calls
- Essential for business logic and decision-making
