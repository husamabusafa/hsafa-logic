"""Core API client for interacting with hsafa-core's extension API."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from hsafa_extension.types import ExtensionSelfInfo, HsafaExtensionConfig, SenseEventInput


class CoreClient:
    """HTTP client for interacting with hsafa-core's extension & admin APIs."""

    def __init__(self, config: HsafaExtensionConfig) -> None:
        self._core_url = config.core_url.rstrip("/")
        self._extension_key = config.extension_key
        self._secret_key = config.secret_key
        self._http = httpx.AsyncClient(timeout=30.0)

    async def close(self) -> None:
        await self._http.aclose()

    # -- Self-discovery (extension key) ----------------------------------------

    async def get_me(self) -> ExtensionSelfInfo:
        res = await self._http.get(
            f"{self._core_url}/api/extensions/me",
            headers={"x-extension-key": self._extension_key},
        )
        res.raise_for_status()
        body = res.json()
        ext = body["extension"]
        return ExtensionSelfInfo(
            id=ext["id"],
            name=ext["name"],
            connections=ext.get("connections", []),
        )

    # -- Push sense events (extension key) -------------------------------------

    async def push_sense_event(self, haseef_id: str, event: SenseEventInput) -> None:
        res = await self._http.post(
            f"{self._core_url}/api/haseefs/{haseef_id}/senses",
            headers={
                "x-extension-key": self._extension_key,
                "Content-Type": "application/json",
            },
            json={
                "event": {
                    "eventId": event.event_id,
                    "channel": event.channel,
                    "source": event.source,
                    "type": event.type,
                    "data": event.data,
                    "timestamp": event.timestamp
                    or datetime.now(timezone.utc).isoformat(),
                }
            },
        )
        if not res.is_success:
            raise RuntimeError(
                f"pushSenseEvent failed for haseef={haseef_id}: {res.status_code} {res.text}"
            )

    # -- Return tool results (extension key) -----------------------------------

    async def return_tool_result(
        self, haseef_id: str, call_id: str, result: Any
    ) -> None:
        res = await self._http.post(
            f"{self._core_url}/api/haseefs/{haseef_id}/tools/{call_id}/result",
            headers={
                "x-extension-key": self._extension_key,
                "Content-Type": "application/json",
            },
            json={"result": result},
        )
        if not res.is_success:
            raise RuntimeError(
                f"returnToolResult failed callId={call_id}: {res.status_code} {res.text}"
            )

    # -- Poll pending tool calls (extension key) -------------------------------

    async def poll_tool_calls(self, haseef_id: str) -> list[dict[str, Any]]:
        res = await self._http.get(
            f"{self._core_url}/api/haseefs/{haseef_id}/tools/calls",
            headers={"x-extension-key": self._extension_key},
        )
        res.raise_for_status()
        return res.json().get("calls", [])

    # -- Bootstrap: sync tools (secret key) ------------------------------------

    async def sync_tools(
        self,
        extension_id: str,
        tools: list[dict[str, Any]],
    ) -> None:
        res = await self._http.put(
            f"{self._core_url}/api/extensions/{extension_id}/tools",
            headers={
                "x-secret-key": self._secret_key,
                "Content-Type": "application/json",
            },
            json={"tools": tools},
        )
        if not res.is_success:
            raise RuntimeError(
                f"syncTools failed: {res.status_code} {res.text}"
            )

    # -- Bootstrap: update instructions (secret key) ---------------------------

    async def update_instructions(
        self, extension_id: str, instructions: str
    ) -> None:
        res = await self._http.patch(
            f"{self._core_url}/api/extensions/{extension_id}",
            headers={
                "x-secret-key": self._secret_key,
                "Content-Type": "application/json",
            },
            json={"instructions": instructions},
        )
        if not res.is_success:
            raise RuntimeError(
                f"updateInstructions failed: {res.status_code} {res.text}"
            )
