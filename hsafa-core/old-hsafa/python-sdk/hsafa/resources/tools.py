import asyncio
import inspect
import json
import sys
import threading
from typing import Any, Callable, Dict

from ..http import HttpClient
from ..sse import SSEStream


class ToolWorkerInstance:
    """Returned by tools.listen() — call close() to disconnect."""

    def __init__(self, stream: SSEStream):
        self._stream = stream

    def close(self) -> None:
        self._stream.close()


class ToolsResource:
    def __init__(self, http: HttpClient):
        self._http = http

    def submit_result(self, run_id: str, call_id: str, result: Any) -> Dict[str, Any]:
        """
        Submit the result of an external tool call back to the gateway.
        The gateway wakes up the agent's next cycle with the result.
        """
        return self._http.post(
            f"/api/runs/{run_id}/tool-results",
            {"callId": call_id, "result": result},
        )

    def listen(self, handlers: Dict[str, Callable]) -> ToolWorkerInstance:
        """
        Connect to the gateway SSE tool-worker stream and handle external tool calls.

        When an agent uses a tool with executionType='external', the gateway emits
        a tool.call event here. The matching handler runs and its return value is
        submitted back to the agent automatically.

        Handlers can be sync or async functions:

            def fetch_data(args):
                return {"results": db.query(args["query"])}

            async def send_email(args):
                await mailer.send(args["to"], args["subject"])
                return {"sent": True}

            worker = client.tools.listen({
                "fetchExternalData": fetch_data,
                "sendEmail": send_email,
            })

            # Graceful shutdown:
            import signal
            signal.signal(signal.SIGINT, lambda *_: (worker.close(), exit(0)))
        """
        if not self._http.secret_key:
            raise ValueError(
                "[HsafaToolWorker] secret_key is required in HsafaClient to use tools.listen()"
            )

        url = f"{self._http.base_url}/api/tools/stream"

        def on_open() -> None:
            print("[HsafaToolWorker] Connected — listening for tool calls")

        def on_error(exc: Exception) -> None:
            print(f"[HsafaToolWorker] Stream error: {exc}", file=sys.stderr)

        stream = SSEStream(
            url,
            headers=self._http.get_auth_headers(),
            reconnect=True,
            reconnect_delay=2.0,
            on_open=on_open,
            on_error=on_error,
        )

        def handle_tool_call(event: Dict[str, Any]) -> None:
            data = event.get("data") or {}
            tool_call_id: str = data.get("toolCallId", "")
            tool_name: str = data.get("toolName", "")
            args: Dict[str, Any] = data.get("args") or {}
            run_id: str = data.get("runId", "")

            handler = handlers.get(tool_name)
            if not handler:
                return

            print(f"[HsafaToolWorker] → {tool_name}({json.dumps(args)})")

            def run_handler() -> None:
                try:
                    if inspect.iscoroutinefunction(handler):
                        result = asyncio.run(handler(args))
                    else:
                        result = handler(args)
                    self.submit_result(run_id, tool_call_id, result)
                    print(f"[HsafaToolWorker] ✓ {tool_name} result submitted")
                except Exception as exc:
                    error_msg = str(exc)
                    print(
                        f"[HsafaToolWorker] ✗ {tool_name} handler error: {error_msg}",
                        file=sys.stderr,
                    )
                    try:
                        self.submit_result(run_id, tool_call_id, {"error": error_msg})
                    except Exception:
                        pass

            t = threading.Thread(target=run_handler, daemon=True)
            t.start()

        stream.on("tool.call", handle_tool_call)
        stream.start()

        return ToolWorkerInstance(stream)
