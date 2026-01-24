# Compute Tool (Logic Tool)

## Overview

Perform safe logic and calculations on data. No external calls or arbitrary code execution - only structured expressions.

## Purpose

- Evaluate conditions and make decisions
- Validate data against rules
- Transform and format data
- Perform calculations and aggregations
- Calculate scores and rankings

## Input Schema

```json
{
  "operation": "string",          // Type of operation (see below)
  "data": {},                     // Input data
  "expression": "string",         // Optional: expression to evaluate
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

## Examples

### Conditional Logic
```json
{
  "operation": "if-then-else",
  "data": {"amount": 5000, "userRole": "manager"},
  "expression": "amount > 10000 ? 'director-approval' : 'auto-approved'"
}
```

### Score Calculation
```json
{
  "operation": "score",
  "data": {"creditScore": 720, "income": 75000, "debtRatio": 0.35},
  "rules": [
    {"field": "creditScore", "weight": 0.4, "scoring": {">=700": 80, "<700": 40}},
    {"field": "debtRatio", "weight": 0.6, "scoring": {"<=0.4": 70, ">0.4": 30}}
  ]
}
```

### Validation
```json
{
  "operation": "validate-rules",
  "data": {"age": 25, "email": "user@example.com"},
  "rules": [
    {"field": "age", "operator": ">=", "value": 18},
    {"field": "email", "operator": "matches", "value": "email-format"}
  ]
}
```

### Calculation
```json
{
  "operation": "calculate",
  "data": {"revenue": 1000000, "costs": 650000},
  "expression": "(revenue - costs) / revenue * 100"
}
```

### Aggregation
```json
{
  "operation": "aggregate",
  "data": [
    {"product": "A", "sales": 1000},
    {"product": "B", "sales": 1500}
  ],
  "parameters": {"operation": "sum", "field": "sales"}
}
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
