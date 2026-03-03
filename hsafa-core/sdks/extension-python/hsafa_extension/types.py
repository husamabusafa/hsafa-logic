"""Type definitions for @hsafa/extension Python SDK."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Protocol


@dataclass
class HsafaExtensionConfig:
    """Configuration for the Hsafa extension SDK."""

    core_url: str
    """Core API base URL (e.g. http://localhost:3100)"""

    extension_key: str
    """Extension key for runtime operations (ek_...)"""

    secret_key: str
    """Secret key for bootstrap operations (sk_...)"""

    redis_url: str | None = None
    """Redis URL for real-time tool call listening. If None, falls back to HTTP polling."""

    poll_interval_s: float = 2.0
    """Polling interval in seconds when using HTTP polling fallback."""

    log_prefix: str | None = None
    """Custom log prefix (default: extension name after discovery)."""


@dataclass
class SenseEventInput:
    """A sense event to push to a Haseef's inbox."""

    event_id: str
    """Unique event ID."""

    channel: str
    """Channel identifier (e.g. 'my-extension')."""

    type: str
    """Event type (e.g. 'message', 'alert', 'update')."""

    source: str = ""
    """Source identifier (e.g. a room ID, webhook ID)."""

    data: dict[str, Any] = field(default_factory=dict)
    """Event payload."""

    timestamp: str | None = None
    """ISO timestamp (defaults to now if None)."""


@dataclass
class ToolCallContext:
    """Context passed to tool handlers when a Haseef invokes a tool."""

    haseef_id: str
    """The Haseef ID that triggered this tool call."""

    haseef_entity_id: str
    """The Haseef's entity ID."""

    run_id: str
    """The run ID this tool call belongs to."""

    tool_call_id: str
    """The unique tool call ID."""

    _push_sense: Callable[[str, SenseEventInput], Awaitable[None]] | None = field(
        default=None, repr=False
    )

    async def push_sense_event(self, event: SenseEventInput) -> None:
        """Push a sense event to this Haseef."""
        if self._push_sense:
            await self._push_sense(self.haseef_id, event)


@dataclass
class ToolDefinition:
    """A tool registered with the extension."""

    name: str
    description: str
    input_schema: dict[str, Any]
    execute: Callable[[dict[str, Any], ToolCallContext], Awaitable[Any]]


@dataclass
class HaseefConnectionInfo:
    """Info about a connected Haseef (available after start())."""

    haseef_id: str
    haseef_name: str
    haseef_entity_id: str
    config: dict[str, Any] | None = None


@dataclass
class ExtensionSelfInfo:
    """Self-discovery response from the core API."""

    id: str
    name: str
    connections: list[dict[str, Any]]
