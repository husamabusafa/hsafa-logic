// =============================================================================
// @hsafa/sdk — Schema Converter
// Converts simple "string" / "number?" / "string[]" type strings to JSON Schema
// =============================================================================

export function inputToJsonSchema(input: Record<string, string>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, typeStr] of Object.entries(input)) {
    const optional = typeStr.endsWith('?');
    const baseType = optional ? typeStr.slice(0, -1) : typeStr;

    if (!optional) required.push(key);

    if (baseType === 'string[]') {
      properties[key] = { type: 'array', items: { type: 'string' } };
    } else if (baseType === 'number[]') {
      properties[key] = { type: 'array', items: { type: 'number' } };
    } else if (baseType === 'boolean[]') {
      properties[key] = { type: 'array', items: { type: 'boolean' } };
    } else if (baseType === 'object') {
      properties[key] = { type: 'object', additionalProperties: true };
    } else {
      properties[key] = { type: baseType };
    }
  }

  const schema: Record<string, unknown> = {
    type: 'object',
    properties,
    additionalProperties: false,
  };

  if (required.length > 0) schema.required = required;

  return schema;
}

// Best-effort partial JSON parsing — accumulates text and tries to parse on each delta
export function parsePartialJson(accumulated: string): Record<string, unknown> {
  // Try direct parse first
  try {
    return JSON.parse(accumulated) as Record<string, unknown>;
  } catch {
    // Try adding closing braces
    const attempts = [
      accumulated + '}',
      accumulated + '"}',
      accumulated + '"}]',
      accumulated + '"}]}',
    ];
    for (const attempt of attempts) {
      try {
        return JSON.parse(attempt) as Record<string, unknown>;
      } catch {
        // continue
      }
    }
    return {};
  }
}
