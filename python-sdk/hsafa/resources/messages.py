import threading
from typing import Any, Dict, List, Optional

from ..http import HttpClient
from ..sse import SSEStream


class MessagesResource:
    def __init__(self, http: HttpClient):
        self._http = http

    def send(
        self,
        space_id: str,
        content: str,
        entity_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        role: Optional[str] = None,
        trigger_agents: Optional[bool] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"content": content}
        if entity_id is not None:
            body["entityId"] = entity_id
        if metadata is not None:
            body["metadata"] = metadata
        if role is not None:
            body["role"] = role
        if trigger_agents is not None:
            body["triggerAgents"] = trigger_agents
        return self._http.post(f"/api/smart-spaces/{space_id}/messages", body)

    def list(
        self,
        space_id: str,
        after_seq: Optional[str] = None,
        before_seq: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        return self._http.get(
            f"/api/smart-spaces/{space_id}/messages",
            {"afterSeq": after_seq, "beforeSeq": before_seq, "limit": limit},
        )

    def send_and_wait(
        self,
        space_id: str,
        content: str,
        entity_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        timeout: float = 30.0,
    ) -> Dict[str, Any]:
        """
        Send a message and block until the agent finishes responding.
        Returns { 'text': str, 'tool_calls': list, 'run': dict }.
        Raises TimeoutError if the agent doesn't respond within `timeout` seconds.
        """
        result = self.send(space_id, content, entity_id=entity_id, metadata=metadata)
        runs: List[Dict[str, Any]] = result.get("runs", [])

        if not runs:
            return {"text": "", "tool_calls": [], "run": None}

        run_id: str = runs[0]["runId"]

        text_parts: List[str] = []
        tool_calls: Dict[str, Dict[str, Any]] = {}
        done_event = threading.Event()
        error_holder: Dict[str, Any] = {}
        settled = threading.Lock()
        _settled = [False]

        def finish() -> None:
            with settled:
                if not _settled[0]:
                    _settled[0] = True
                    done_event.set()

        def on_error_event(event: Dict[str, Any]) -> None:
            with settled:
                if not _settled[0]:
                    _settled[0] = True
                    error_holder["error"] = str(
                        (event.get("data") or {}).get("error", "Stream error")
                    )
                    done_event.set()

        space_stream = SSEStream(
            self._http.build_url(f"/api/smart-spaces/{space_id}/stream"),
            self._http.get_auth_headers(),
            reconnect=False,
        )
        run_stream = SSEStream(
            self._http.build_url(f"/api/runs/{run_id}/stream"),
            self._http.get_auth_headers(),
            reconnect=False,
        )

        def on_space_message(event: Dict[str, Any]) -> None:
            msg = (event.get("data") or {}).get("message") or {}
            role_ = msg.get("role", "")
            if role_ not in ("assistant", "agent"):
                return
            c = msg.get("content")
            if c:
                text_parts.append(c)

        def on_agent_inactive(event: Dict[str, Any]) -> None:
            rid = event.get("runId") or (event.get("data") or {}).get("runId")
            if rid == run_id:
                finish()

        def on_tool_started(event: Dict[str, Any]) -> None:
            data = event.get("data") or {}
            call_id = str(data.get("streamId") or data.get("toolCallId") or "")
            if call_id:
                tool_calls[call_id] = {
                    "id": call_id,
                    "name": str(data.get("toolName", "")),
                    "input": None,
                    "output": None,
                }

        def on_tool_done(event: Dict[str, Any]) -> None:
            data = event.get("data") or {}
            call_id = str(data.get("streamId") or data.get("toolCallId") or "")
            if call_id in tool_calls:
                tool_calls[call_id]["input"] = data.get("input")
                tool_calls[call_id]["output"] = data.get("result") or data.get("output")

        def on_run_completed(_event: Dict[str, Any]) -> None:
            finish()

        def on_run_failed(event: Dict[str, Any]) -> None:
            with settled:
                if not _settled[0]:
                    _settled[0] = True
                    data = event.get("data") or {}
                    error_holder["error"] = str(data.get("errorMessage", "Run failed"))
                    done_event.set()

        space_stream.on("space.message", on_space_message)
        space_stream.on("agent.inactive", on_agent_inactive)
        space_stream.on("error", on_error_event)

        run_stream.on("tool.started", on_tool_started)
        run_stream.on("tool.done", on_tool_done)
        run_stream.on("run.completed", on_run_completed)
        run_stream.on("run.failed", on_run_failed)
        run_stream.on("error", on_error_event)

        space_stream.start()
        run_stream.start()

        try:
            if not done_event.wait(timeout=timeout):
                raise TimeoutError(f"send_and_wait timed out after {timeout}s")
            if "error" in error_holder:
                raise RuntimeError(error_holder["error"])
            return {
                "text": "\n".join(text_parts),
                "tool_calls": list(tool_calls.values()),
                "run": {"id": run_id},
            }
        finally:
            space_stream.close()
            run_stream.close()
