import json
import threading
import time
from typing import Any, Callable, Dict, List, Optional

import requests


class SSEStream:
    """
    Server-Sent Events stream that runs in a background daemon thread.
    Auto-reconnects with exponential backoff on failure.
    """

    def __init__(
        self,
        url: str,
        headers: Dict[str, str],
        reconnect: bool = True,
        reconnect_delay: float = 1.0,
        max_reconnect_delay: float = 30.0,
        on_open: Optional[Callable[[], None]] = None,
        on_error: Optional[Callable[[Exception], None]] = None,
        on_close: Optional[Callable[[], None]] = None,
    ):
        self._url = url
        self._headers = {
            **headers,
            "Accept": "text/event-stream",
            "Cache-Control": "no-cache",
        }
        self._reconnect = reconnect
        self._reconnect_delay = reconnect_delay
        self._max_reconnect_delay = max_reconnect_delay
        self._on_open = on_open
        self._on_error = on_error
        self._on_close = on_close
        self._handlers: Dict[str, List[Callable]] = {}
        self._closed = False
        self._reconnect_attempts = 0
        self._thread: Optional[threading.Thread] = None

    def on(self, event_type: str, handler: Callable[[Dict[str, Any]], None]) -> None:
        self._handlers.setdefault(event_type, []).append(handler)

    def off(self, event_type: str, handler: Callable) -> None:
        if event_type in self._handlers:
            try:
                self._handlers[event_type].remove(handler)
            except ValueError:
                pass

    def close(self) -> None:
        self._closed = True
        if self._on_close:
            self._on_close()

    def start(self) -> "SSEStream":
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        return self

    def _emit(self, event_type: str, event: Dict[str, Any]) -> None:
        for handler in self._handlers.get(event_type, []):
            try:
                handler(event)
            except Exception:
                pass
        for handler in self._handlers.get("*", []):
            try:
                handler(event)
            except Exception:
                pass

    def _process_raw(self, raw: Dict[str, Any]) -> None:
        data_str = "\n".join(raw.get("data", []))
        if not data_str:
            return
        try:
            parsed = json.loads(data_str)
            data_field = parsed.get("data") or parsed
            event: Dict[str, Any] = {
                "id": raw.get("id") or parsed.get("id", ""),
                "type": parsed.get("type") or raw.get("type") or "unknown",
                "ts": parsed.get("ts", ""),
                "data": data_field,
                "smartSpaceId": parsed.get("smartSpaceId"),
                "runId": parsed.get("runId") or (data_field.get("runId") if isinstance(data_field, dict) else None),
                "entityId": parsed.get("entityId"),
                "agentEntityId": parsed.get("agentEntityId"),
                "seq": parsed.get("seq"),
            }
            self._emit(event["type"], event)
        except (json.JSONDecodeError, Exception):
            pass

    def _run(self) -> None:
        while not self._closed:
            try:
                with requests.get(
                    self._url,
                    headers=self._headers,
                    stream=True,
                    timeout=None,
                ) as resp:
                    if not resp.ok:
                        raise ConnectionError(
                            f"SSE connection failed: {resp.status_code} {resp.reason}"
                        )

                    self._reconnect_attempts = 0
                    if self._on_open:
                        self._on_open()

                    current: Dict[str, Any] = {"data": [], "id": None, "type": None}

                    for raw_line in resp.iter_lines(decode_unicode=True):
                        if self._closed:
                            return

                        if raw_line is None:
                            continue

                        line: str = raw_line

                        if line.startswith(":"):
                            continue

                        if line == "":
                            if current["data"]:
                                self._process_raw(current)
                            current = {"data": [], "id": None, "type": None}
                            continue

                        colon = line.find(":")
                        if colon == -1:
                            continue
                        field = line[:colon]
                        value = line[colon + 1 :].lstrip(" ")

                        if field == "id":
                            current["id"] = value
                        elif field == "event":
                            current["type"] = value
                        elif field == "data":
                            current["data"].append(value)

            except Exception as exc:
                if self._closed:
                    return
                if self._on_error:
                    self._on_error(exc)
                if not self._reconnect:
                    break
                self._reconnect_attempts += 1
                delay = min(
                    self._reconnect_delay * (2 ** (self._reconnect_attempts - 1)),
                    self._max_reconnect_delay,
                )
                time.sleep(delay)
