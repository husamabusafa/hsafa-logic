import json
from typing import Dict, Any


def input_to_json_schema(input_types: Dict[str, str]) -> Dict[str, Any]:
    properties: Dict[str, Any] = {}
    required: list[str] = []

    for key, type_str in input_types.items():
        optional = type_str.endswith('?')
        base_type = type_str[:-1] if optional else type_str

        if not optional:
            required.append(key)

        if base_type == 'string[]':
            properties[key] = {'type': 'array', 'items': {'type': 'string'}}
        elif base_type == 'number[]':
            properties[key] = {'type': 'array', 'items': {'type': 'number'}}
        elif base_type == 'boolean[]':
            properties[key] = {'type': 'array', 'items': {'type': 'boolean'}}
        elif base_type == 'object':
            properties[key] = {'type': 'object', 'additionalProperties': True}
        else:
            properties[key] = {'type': base_type}

    schema: Dict[str, Any] = {
        'type': 'object',
        'properties': properties,
        'additionalProperties': False,
    }

    if required:
        schema['required'] = required

    return schema


def parse_partial_json(accumulated: str) -> Dict[str, Any]:
    try:
        return json.loads(accumulated)
    except json.JSONDecodeError:
        attempts = [
            accumulated + '}',
            accumulated + '"}',
            accumulated + '"}]',
            accumulated + '"}]}',
        ]
        for attempt in attempts:
            try:
                return json.loads(attempt)
            except json.JSONDecodeError:
                continue
        return {}
