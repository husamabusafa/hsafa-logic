import asyncio
import inspect
import json
from typing import Dict, Any, List, Optional, Callable, Set
from urllib.parse import urlencode

from .types import (
    SdkOptions,
    ToolDefinition,
    ToolHandler,
    PushEventPayload,
    ToolCallContext,
    HaseefContext,
)
from .schema import input_to_json_schema, parse_partial_json

DEFAULT_RECONNECT_DELAY = 2.0
MAX_RECONNECT_DELAY = 30.0
DEFAULT_API_BASE = '/api/v7'


class HaseefAPI:
    def __init__(self, sdk: 'HsafaSDK'):
        self._sdk = sdk

    async def list(self) -> List[Dict[str, Any]]:
        res = await self._sdk._request("GET", f"{self._sdk.api_base}/haseefs")
        return res.get("haseefs", [])

    async def get(self, haseef_id: str) -> Dict[str, Any]:
        res = await self._sdk._request("GET", f"{self._sdk.api_base}/haseefs/{haseef_id}")
        return res.get("haseef", {})

    async def create(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        res = await self._sdk._request("POST", f"{self._sdk.api_base}/haseefs", body=input_data)
        return res.get("haseef", {})

    async def update(self, haseef_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
        res = await self._sdk._request("PATCH", f"{self._sdk.api_base}/haseefs/{haseef_id}", body=patch)
        return res.get("haseef", {})

    async def delete(self, haseef_id: str) -> None:
        await self._sdk._request("DELETE", f"{self._sdk.api_base}/haseefs/{haseef_id}")

    async def get_profile(self, haseef_id: str) -> Dict[str, Any]:
        res = await self._sdk._request("GET", f"{self._sdk.api_base}/haseefs/{haseef_id}/profile")
        return res.get("profile", {})

    async def update_profile(self, haseef_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
        res = await self._sdk._request("PATCH", f"{self._sdk.api_base}/haseefs/{haseef_id}/profile", body=patch)
        return res.get("profile", {})

    async def add_skill(self, haseef_id: str, skill_name: str) -> Dict[str, Any]:
        haseef = await self.get(haseef_id)
        current = haseef.get("skills") or []
        if skill_name in current:
            return haseef
        return await self.update(haseef_id, {"skills": [*current, skill_name]})

    async def remove_skill(self, haseef_id: str, skill_name: str) -> Dict[str, Any]:
        haseef = await self.get(haseef_id)
        current = haseef.get("skills") or []
        if skill_name not in current:
            return haseef
        return await self.update(haseef_id, {"skills": [s for s in current if s != skill_name]})

    async def status(self, haseef_id: str) -> Dict[str, Any]:
        return await self._sdk._request("GET", f"{self._sdk.api_base}/haseefs/{haseef_id}/status")


class MemoryAPI:
    def __init__(self, sdk: 'HsafaSDK'):
        self._sdk = sdk

    async def list(self, haseef_id: str) -> List[Dict[str, Any]]:
        res = await self._sdk._request("GET", f"{self._sdk.api_base}/memory/{haseef_id}/semantic")
        return res.get("memories", [])

    async def search(self, haseef_id: str, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        qs = urlencode({"q": query, "limit": limit})
        res = await self._sdk._request("GET", f"{self._sdk.api_base}/memory/{haseef_id}/semantic/search?{qs}")
        return res.get("results", [])

    async def set(self, haseef_id: str, memories: List[Dict[str, Any]]) -> Dict[str, Any]:
        return await self._sdk._request("POST", f"{self._sdk.api_base}/memory/{haseef_id}/semantic", body={"memories": memories})

    async def delete(self, haseef_id: str, keys: List[str]) -> Dict[str, Any]:
        return await self._sdk._request("DELETE", f"{self._sdk.api_base}/memory/{haseef_id}/semantic", body={"keys": keys})

    async def episodes(self, haseef_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        res = await self._sdk._request("GET", f"{self._sdk.api_base}/memory/{haseef_id}/episodic?limit={limit}")
        return res.get("episodes", [])

    async def search_episodes(self, haseef_id: str, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        qs = urlencode({"q": query, "limit": limit})
        res = await self._sdk._request("GET", f"{self._sdk.api_base}/memory/{haseef_id}/episodic/search?{qs}")
        return res.get("results", [])

    async def social(self, haseef_id: str) -> List[Dict[str, Any]]:
        res = await self._sdk._request("GET", f"{self._sdk.api_base}/memory/{haseef_id}/social")
        return res.get("people", [])

    async def procedural(self, haseef_id: str) -> List[Dict[str, Any]]:
        res = await self._sdk._request("GET", f"{self._sdk.api_base}/memory/{haseef_id}/procedural")
        return res.get("patterns", [])

    async def stats(self, haseef_id: str) -> Dict[str, Any]:
        return await self._sdk._request("GET", f"{self._sdk.api_base}/memory/{haseef_id}/stats")


class RunsAPI:
    def __init__(self, sdk: 'HsafaSDK'):
        self._sdk = sdk

    async def list(
        self,
        haseef_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        params: Dict[str, Any] = {}
        if haseef_id:
            params["haseefId"] = haseef_id
        if status:
            params["status"] = status
        if limit is not None:
            params["limit"] = limit
        qs = urlencode(params)
        path = f"{self._sdk.api_base}/runs" + (f"?{qs}" if qs else "")
        res = await self._sdk._request("GET", path)
        return res.get("runs", [])

    async def get(self, run_id: str) -> Dict[str, Any]:
        res = await self._sdk._request("GET", f"{self._sdk.api_base}/runs/{run_id}")
        return res.get("run", {})


class HsafaSDK:
    def __init__(self, opts: SdkOptions):
        self.core_url = opts.get("core_url", "http://localhost:3001").rstrip("/")
        self.api_key = opts.get("api_key", "")
        self.skill = opts.get("skill", "")
        self.api_base = (opts.get("api_base") or DEFAULT_API_BASE).rstrip("/")

        self._tool_handlers: Dict[str, ToolHandler] = {}
        self._event_listeners: Dict[str, Set[Callable[[Any], Any]]] = {}
        self._is_connected = False
        self._client = httpx.AsyncClient()

        self.haseef = HaseefAPI(self)
        self.memory = MemoryAPI(self)
        self.runs = RunsAPI(self)

    async def register_tools(self, tools: List[ToolDefinition]) -> None:
        body = []
        for t in tools:
            schema = t.get("inputSchema") or input_to_json_schema(t.get("input") or {})
            body.append({
                "name": t["name"],
                "description": t["description"],
                "inputSchema": schema,
            })

        path = f"{self.api_base}/skills/{self.skill}/tools"
        await self._request("PUT", path, body={"tools": body})

    def on_tool_call(self, name: str, handler: ToolHandler) -> None:
        self._tool_handlers[name] = handler

    async def push_event(self, event: PushEventPayload) -> None:
        payload = {"skill": self.skill, **event}
        await self._request("POST", f"{self.api_base}/events", body=payload)

    def on(self, event_name: str, listener: Callable[[Any], Any]) -> None:
        if event_name not in self._event_listeners:
            self._event_listeners[event_name] = set()
        self._event_listeners[event_name].add(listener)

    def off(self, event_name: str, listener: Callable[[Any], Any]) -> None:
        if event_name in self._event_listeners:
            self._event_listeners[event_name].discard(listener)

    async def _emit(self, event_name: str, data: Any) -> None:
        listeners = self._event_listeners.get(event_name, set())
        for listener in listeners:
            try:
                if inspect.iscoroutinefunction(listener):
                    await listener(data)
                else:
                    listener(data)
            except Exception as e:
                print(f"[HsafaSDK] Listener error on {event_name}: {e}")

    async def connect(self) -> None:
        """
        Connects to the SSE stream and blocks until disconnect() is called.
        Wrap in asyncio.create_task() to run in background alongside other code:
            asyncio.create_task(sdk.connect())
        """
        if self._is_connected:
            return
        self._is_connected = True

        delay = DEFAULT_RECONNECT_DELAY
        while self._is_connected:
            try:
                await self._open_sse()
                delay = DEFAULT_RECONNECT_DELAY
            except asyncio.CancelledError:
                break
            except Exception as e:
                if not self._is_connected:
                    break
                print(f"[HsafaSDK] SSE Connection lost ({e}). Reconnecting in {delay}s...")
                await asyncio.sleep(delay)
                delay = min(delay * 2, MAX_RECONNECT_DELAY)

    async def disconnect(self) -> None:
        self._is_connected = False
        await self._client.aclose()

    async def _open_sse(self) -> None:
        url = f"{self.core_url}{self.api_base}/skills/{self.skill}/actions/stream"
        headers = {
            "x-api-key": self.api_key,
            "Accept": "text/event-stream",
        }

        async with self._client.stream("GET", url, headers=headers, timeout=None) as response:
            response.raise_for_status()

            data_line = ""
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data_line = line[6:].strip()
                elif line == "" and data_line:
                    try:
                        msg = json.loads(data_line)
                        asyncio.create_task(self._handle_message(msg))
                    except json.JSONDecodeError:
                        pass
                    data_line = ""

    async def _handle_message(self, msg: Dict[str, Any]) -> None:
        msg_type = msg.get("type")

        lifecycle_events = [
            "tool.input.start",
            "tool.input.delta",
            "tool.call",
            "tool.result",
            "tool.error",
            "run.started",
            "run.completed",
        ]

        if msg_type in lifecycle_events:
            await self._emit(msg_type, msg.get("data"))
            return

        if msg_type == "action":
            action_id = msg.get("actionId")
            tool_name = msg.get("toolName")
            args = msg.get("args", {})
            haseef = msg.get("haseef", {})

            handler = self._tool_handlers.get(tool_name)
            if not handler:
                await self._post_result(action_id, {"error": f'No handler registered for tool "{tool_name}"'})
                return

            try:
                ctx: ToolCallContext = {"actionId": action_id, "haseef": haseef}
                result = await handler(args, ctx)
                await self._post_result(action_id, result)
            except Exception as e:
                await self._post_result(action_id, {"error": str(e)})

        if msg_type == "tool.input.delta.raw":
            data = msg.get("data", {})
            partial_text = data.get("accumulatedText", "")
            await self._emit("tool.input.delta", {
                "actionId": data.get("actionId"),
                "toolName": data.get("toolName"),
                "delta": partial_text,
                "partialArgs": parse_partial_json(partial_text),
                "haseef": data.get("haseef"),
            })

    async def _post_result(self, action_id: str, result: Any) -> None:
        try:
            path = f"{self.api_base}/actions/{action_id}/result"
            await self._request("POST", path, body={"result": result})
        except Exception as e:
            print(f"[HsafaSDK:{self.skill}] Failed to submit result for action {action_id}: {e}")

    async def _request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
    ) -> Any:
        url = f"{self.core_url}{path}"
        headers = {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
        }

        response = await self._client.request(method, url, headers=headers, json=body)

        if not response.is_success:
            raise Exception(f"{method} {path} failed ({response.status_code}): {response.text}")

        if response.status_code == 204 or not response.content:
            return None

        if "application/json" in response.headers.get("content-type", ""):
            return response.json()

        return None


import httpx
