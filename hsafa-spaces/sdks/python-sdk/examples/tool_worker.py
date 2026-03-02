"""
Hsafa Python Tool Worker — example

Connects to the gateway SSE tool-worker stream and handles external tool calls.
Run alongside the gateway to enable external tool execution:

    pip install -e ../
    python tool_worker.py

Required env vars:
    HSAFA_GATEWAY_URL  — default: http://localhost:3001
    HSAFA_SECRET_KEY   — same gateway secret key used for all server-to-server calls
"""

import os
import signal
import time

from hsafa import HsafaClient

gateway_url = os.environ.get("HSAFA_GATEWAY_URL", "http://localhost:3001")
secret_key = os.environ.get("HSAFA_SECRET_KEY", "")

if not secret_key:
    print("ERROR: HSAFA_SECRET_KEY env var is required")
    exit(1)

client = HsafaClient(gateway_url=gateway_url, secret_key=secret_key)
print(f"[tool-worker] Starting — gateway: {gateway_url}")


def fetch_external_data(args: dict) -> dict:
    query: str = args.get("query", "")
    print(f"[tool-worker] fetchExternalData query={query!r}")

    all_projects = [
        {"id": 1, "title": "Project Alpha", "status": "active", "progress": 78},
        {"id": 2, "title": "Project Beta", "status": "completed", "progress": 100},
        {"id": 3, "title": "Project Gamma", "status": "planning", "progress": 12},
    ]

    if not query:
        results = all_projects
    else:
        words = query.lower().split()
        results = [
            p for p in all_projects
            if any(
                w in p["title"].lower() or w in p["status"].lower()
                for w in words
            )
        ]

    return {
        "source": "python-tool-worker",
        "query": query,
        "results": results,
        "summary": f'Found {len(results)} result{"s" if len(results) != 1 else ""} for "{query}".',
    }


# Optional: async handler example
# async def send_notification(args: dict) -> dict:
#     await some_async_lib.notify(args["to"], args["message"])
#     return {"sent": True}


worker = client.tools.listen({
    "fetchExternalData": fetch_external_data,
    # "sendNotification": send_notification,
})


def shutdown(*_):
    print("\n[tool-worker] Shutting down...")
    worker.close()
    exit(0)


signal.signal(signal.SIGINT, shutdown)
signal.signal(signal.SIGTERM, shutdown)

# Keep main thread alive
while True:
    time.sleep(1)
