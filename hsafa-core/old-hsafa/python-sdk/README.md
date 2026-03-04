# @hsafa/python — Hsafa Python SDK

Python SDK for the Hsafa gateway v3. Mirrors the Node.js SDK API surface.

## Install

```bash
pip install -e .
# or in a project:
pip install hsafa
```

**Requires:** Python 3.9+, `requests`

## Quick Start

```python
from hsafa import HsafaClient

client = HsafaClient(
    gateway_url="http://localhost:3001",
    secret_key="sk_...",
)

# Send a message and wait for agent response
response = client.messages.send_and_wait(
    space_id="<space-id>",
    content="Hello, what's the status of active projects?",
    entity_id="<entity-id>",
    timeout=30.0,
)
print(response["text"])
```

## External Tool Worker

Run a Python process to handle external tool calls (`executionType: 'external'`):

```python
import signal, time
from hsafa import HsafaClient

client = HsafaClient(gateway_url="...", secret_key="sk_...")

def fetch_external_data(args: dict) -> dict:
    query = args.get("query", "")
    results = my_database.search(query)          # any sync logic
    return {"results": results, "query": query}

# Async handlers also work:
# async def send_email(args: dict) -> dict:
#     await mailer.send(args["to"], args["body"])
#     return {"sent": True}

worker = client.tools.listen({
    "fetchExternalData": fetch_external_data,
})

signal.signal(signal.SIGINT, lambda *_: (worker.close(), exit(0)))

while True:
    time.sleep(1)   # keep main thread alive
```

Run it alongside the gateway:
```bash
HSAFA_GATEWAY_URL=http://localhost:3001 \
HSAFA_SECRET_KEY=sk_... \
python examples/tool_worker.py
```

## API Reference

### `HsafaClient(gateway_url, secret_key=None, public_key=None, jwt=None)`

#### `client.agents`
| Method | Description |
|---|---|
| `create(name, config)` | Create an agent |
| `list(limit, offset)` | List all agents |
| `get(agent_id)` | Get agent by ID |
| `delete(agent_id)` | Delete agent |
| `trigger(agent_id, service_name, payload)` | Trigger from external service |

#### `client.entities`
| Method | Description |
|---|---|
| `create(external_id, display_name, metadata)` | Create human entity |
| `create_agent(agent_id, display_name)` | Create agent entity |
| `list(type, limit, offset)` | List entities |
| `get(entity_id)` | Get entity |
| `update(entity_id, display_name, metadata)` | Update entity |
| `delete(entity_id)` | Delete entity |
| `subscribe(entity_id)` → `SSEStream` | Subscribe to entity events |

#### `client.spaces`
| Method | Description |
|---|---|
| `create(name, description, metadata)` | Create space |
| `list(entity_id, limit, offset)` | List spaces |
| `get(space_id)` | Get space |
| `update(space_id, ...)` | Update space |
| `delete(space_id)` | Delete space |
| `add_member(space_id, entity_id, role)` | Add member |
| `list_members(space_id)` | List members |
| `remove_member(space_id, entity_id)` | Remove member |
| `subscribe(space_id, after_seq, since)` → `SSEStream` | Subscribe to space events |

#### `client.messages`
| Method | Description |
|---|---|
| `send(space_id, content, entity_id, ...)` | Send a message |
| `list(space_id, after_seq, before_seq, limit)` | List messages |
| `send_and_wait(space_id, content, entity_id, timeout)` | Send and block until agent replies |

#### `client.runs`
| Method | Description |
|---|---|
| `list(space_id, agent_entity_id, status, ...)` | List runs |
| `get(run_id)` | Get run |
| `create(agent_entity_id, ...)` | Create run |
| `cancel(run_id)` | Cancel run |
| `delete(run_id)` | Delete run |
| `get_events(run_id)` | Get run events |
| `subscribe(run_id, since)` → `SSEStream` | Subscribe to run stream |

#### `client.tools`
| Method | Description |
|---|---|
| `submit_result(run_id, call_id, result)` | Submit async tool result |
| `listen(handlers)` → `ToolWorkerInstance` | Connect to tool-worker SSE stream |

#### `client.setup`
| Method | Description |
|---|---|
| `create_space(name, agents, humans)` | Create space + entities + memberships |

## SSE Stream

`subscribe()` methods return an `SSEStream` that runs in a background daemon thread:

```python
stream = client.spaces.subscribe(space_id)

stream.on("space.message", lambda event: print(event["data"]))
stream.on("agent.active",  lambda event: print("agent is thinking"))
stream.on("agent.inactive", lambda event: print("agent done"))
stream.on("*", lambda event: ...)   # wildcard — all events

stream.close()
```

## Auth

| Key | Header | Used for |
|---|---|---|
| `secret_key` (`sk_...`) | `x-secret-key` | Backends, services, tool workers |
| `public_key` (`pk_...`) + `jwt` | `x-public-key` + `Authorization: Bearer` | Browser/mobile clients |
