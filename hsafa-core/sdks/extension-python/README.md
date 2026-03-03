# hsafa-extension

Python SDK for building Hsafa extensions.

## Installation

```bash
pip install hsafa-extension
# Optional: for real-time tool calls via Redis
pip install hsafa-extension[redis]
```

## Quick Start

```python
import asyncio
from hsafa_extension import HsafaExtension, HsafaExtensionConfig, SenseEventInput

ext = HsafaExtension(HsafaExtensionConfig(
    core_url="http://localhost:3100",
    extension_key="ek_...",
    secret_key="sk_...",
    redis_url="redis://localhost:6379",  # optional — enables real-time tool calls
))

@ext.tool("greet", description="Greet a user by name", input_schema={
    "type": "object",
    "properties": {
        "name": {"type": "string", "description": "Name to greet"},
    },
    "required": ["name"],
})
async def greet(args, ctx):
    return {"message": f"Hello, {args['name']}!"}

ext.instructions("""[Extension: Greeter]
You can greet users by name using the greet tool.""")

async def main():
    await ext.start()
    # Extension is now running — Ctrl+C to stop
    try:
        await asyncio.Event().wait()
    except KeyboardInterrupt:
        await ext.stop()

asyncio.run(main())
```

## Configuration

| Option | Required | Description |
|---|---|---|
| `core_url` | ✅ | Core API base URL |
| `extension_key` | ✅ | Extension key (`ek_...`) for runtime ops |
| `secret_key` | ✅ | Secret key (`sk_...`) for bootstrap ops |
| `redis_url` | ❌ | Redis URL for real-time tool calls. Falls back to HTTP polling if omitted. |
| `poll_interval_s` | ❌ | Polling interval when using HTTP fallback (default: 2.0s) |
| `log_prefix` | ❌ | Custom log prefix (default: extension name) |

## Tool Handler Context

Every tool handler receives `(args, ctx)`:

```python
@dataclass
class ToolCallContext:
    haseef_id: str          # Which Haseef called this tool
    haseef_entity_id: str   # The Haseef's entity ID
    run_id: str             # The run this tool call belongs to
    tool_call_id: str       # Unique tool call ID

    async def push_sense_event(self, event: SenseEventInput) -> None:
        """Push a sense event to this Haseef."""
```

## Pushing Sense Events

```python
import uuid
from hsafa_extension import SenseEventInput

await ext.push_sense_event(haseef_id, SenseEventInput(
    event_id=str(uuid.uuid4()),
    channel="my-extension",
    type="alert",
    data={"message": "Something happened"},
))
```

## Accessing Connected Haseefs

```python
await ext.start()

for conn in ext.connections:
    print(f"{conn.haseef_name} ({conn.haseef_entity_id})")
    print(f"Config: {conn.config}")
```

## Environment Variables

```env
CORE_URL=http://localhost:3100
EXTENSION_KEY=ek_...
HSAFA_SECRET_KEY=sk_...
REDIS_URL=redis://localhost:6379
```

## Low-Level Client

For advanced use cases, the `CoreClient` is also exported:

```python
from hsafa_extension import CoreClient, HsafaExtensionConfig

client = CoreClient(HsafaExtensionConfig(...))
me = await client.get_me()
await client.push_sense_event(haseef_id, event)
await client.return_tool_result(haseef_id, call_id, result)
```
