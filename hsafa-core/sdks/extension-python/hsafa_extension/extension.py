"""Main HsafaExtension class — the primary interface for building extensions."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Awaitable, Callable

from hsafa_extension.client import CoreClient
from hsafa_extension.types import (
    HaseefConnectionInfo,
    HsafaExtensionConfig,
    SenseEventInput,
    ToolCallContext,
    ToolDefinition,
)

logger = logging.getLogger("hsafa_extension")


class HsafaExtension:
    """
    High-level SDK for building Hsafa extensions.

    Usage::

        ext = HsafaExtension(HsafaExtensionConfig(
            core_url="http://localhost:3100",
            extension_key="ek_...",
            secret_key="sk_...",
            redis_url="redis://localhost:6379",
        ))

        @ext.tool("greet", description="Greet someone", input_schema={...})
        async def greet(args, ctx):
            return {"message": f"Hello, {args['name']}!"}

        ext.instructions("You can greet users with the greet tool.")

        await ext.start()
    """

    def __init__(self, config: HsafaExtensionConfig) -> None:
        self._config = config
        self._client = CoreClient(config)
        self._tools: dict[str, ToolDefinition] = {}
        self._instructions_text: str = ""
        self._extension_id: str | None = None
        self._extension_name: str | None = None
        self._connections: list[HaseefConnectionInfo] = []
        self._running = False
        self._redis_task: asyncio.Task[None] | None = None
        self._poll_task: asyncio.Task[None] | None = None
        self._prefix = config.log_prefix or "hsafa-ext"

    def _log(self, msg: str, *args: Any) -> None:
        logger.info(f"[{self._prefix}] {msg}", *args)

    # -- Public API: Register a tool -------------------------------------------

    def tool(
        self,
        name: str,
        *,
        description: str,
        input_schema: dict[str, Any],
    ) -> Callable[
        [Callable[[dict[str, Any], ToolCallContext], Awaitable[Any]]],
        Callable[[dict[str, Any], ToolCallContext], Awaitable[Any]],
    ]:
        """Decorator to register a tool handler.

        Usage::

            @ext.tool("my_tool", description="...", input_schema={...})
            async def my_tool(args, ctx):
                return {"result": "done"}
        """

        def decorator(
            fn: Callable[[dict[str, Any], ToolCallContext], Awaitable[Any]],
        ) -> Callable[[dict[str, Any], ToolCallContext], Awaitable[Any]]:
            self._tools[name] = ToolDefinition(
                name=name,
                description=description,
                input_schema=input_schema,
                execute=fn,
            )
            return fn

        return decorator

    # -- Public API: Set instructions ------------------------------------------

    def instructions(self, text: str) -> None:
        """Set instructions that are injected into the Haseef's system prompt."""
        self._instructions_text = text

    # -- Public API: Push sense events -----------------------------------------

    async def push_sense_event(
        self, haseef_id: str, event: SenseEventInput
    ) -> None:
        """Push a sense event to a specific Haseef's inbox."""
        await self._client.push_sense_event(haseef_id, event)

    # -- Public API: Connected Haseefs -----------------------------------------

    @property
    def connections(self) -> list[HaseefConnectionInfo]:
        """Connected Haseefs (available after start())."""
        return list(self._connections)

    # -- Public API: Start -----------------------------------------------------

    async def start(self) -> None:
        """Discover self, sync tools, start listening for tool calls."""
        if self._running:
            return

        # 1. Self-discover
        self._log("Discovering self...")
        me = await self._client.get_me()
        self._extension_id = me.id
        self._extension_name = me.name

        if self._config.log_prefix is None:
            self._prefix = me.name

        self._log(f"Extension ID: {me.id}, name: {me.name}")
        self._log(f"Connected to {len(me.connections)} haseef(s)")

        # Parse connections
        self._connections = [
            HaseefConnectionInfo(
                haseef_id=c.get("haseefId", ""),
                haseef_name=c.get("haseefName", ""),
                haseef_entity_id=c.get("haseefEntityId", ""),
                config=c.get("config"),
            )
            for c in me.connections
        ]

        # 2. Sync tools
        if self._tools:
            tool_defs = [
                {
                    "name": t.name,
                    "description": t.description,
                    "inputSchema": t.input_schema,
                }
                for t in self._tools.values()
            ]
            await self._client.sync_tools(me.id, tool_defs)
            self._log(f"Tools synced: {', '.join(t.name for t in self._tools.values())}")

        # 3. Update instructions
        if self._instructions_text:
            await self._client.update_instructions(me.id, self._instructions_text)
            self._log("Instructions updated")

        # 4. Start listening
        self._running = True

        if self._config.redis_url:
            self._redis_task = asyncio.create_task(self._redis_listener(me.id))
        else:
            self._poll_task = asyncio.create_task(self._poll_loop())

        self._log("Ready")

    # -- Public API: Stop ------------------------------------------------------

    async def stop(self) -> None:
        """Stop listening for tool calls and clean up."""
        self._running = False
        self._log("Stopping...")

        if self._redis_task and not self._redis_task.done():
            self._redis_task.cancel()
            try:
                await self._redis_task
            except asyncio.CancelledError:
                pass
            self._redis_task = None

        if self._poll_task and not self._poll_task.done():
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
            self._poll_task = None

        await self._client.close()
        self._log("Stopped")

    # -- Redis listener --------------------------------------------------------

    async def _redis_listener(self, extension_id: str) -> None:
        try:
            import redis.asyncio as aioredis
        except ImportError:
            self._log("redis package not available, falling back to HTTP polling")
            self._poll_task = asyncio.create_task(self._poll_loop())
            return

        channel = f"ext:{extension_id}:tools"
        self._log(f"Subscribing to Redis channel: {channel}")

        r = aioredis.from_url(self._config.redis_url)  # type: ignore[arg-type]
        pubsub = r.pubsub()
        await pubsub.subscribe(channel)

        try:
            while self._running:
                msg = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
                if msg and msg["type"] == "message":
                    raw = msg["data"]
                    if isinstance(raw, bytes):
                        raw = raw.decode("utf-8")
                    await self._handle_tool_call_message(raw)
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()
            await r.close()

    # -- HTTP polling fallback -------------------------------------------------

    async def _poll_loop(self) -> None:
        interval = self._config.poll_interval_s
        self._log(f"Starting HTTP polling (interval: {interval}s)")

        try:
            while self._running:
                for conn in self._connections:
                    if not self._running:
                        break
                    try:
                        await self._poll_haseef(conn)
                    except Exception as exc:
                        self._log(f"Poll error for {conn.haseef_name}: {exc}")
                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            pass

    async def _poll_haseef(self, conn: HaseefConnectionInfo) -> None:
        calls = await self._client.poll_tool_calls(conn.haseef_id)
        for call in calls:
            if call.get("status") != "waiting":
                continue
            await self._execute_tool_call(
                tool_call_id=call["toolCallId"],
                tool_name=call["toolName"],
                args=call.get("args", {}),
                run_id=call.get("runId", ""),
                haseef_id=conn.haseef_id,
                haseef_entity_id=conn.haseef_entity_id,
            )

    # -- Tool call handling ----------------------------------------------------

    async def _handle_tool_call_message(self, raw: str) -> None:
        try:
            event = json.loads(raw)
        except json.JSONDecodeError:
            return

        if event.get("type") != "tool.call":
            return

        haseef_entity_id = event.get("haseefEntityId", "")
        conn = next(
            (c for c in self._connections if c.haseef_entity_id == haseef_entity_id),
            None,
        )
        if not conn:
            self._log(f"No connection for haseefEntityId={haseef_entity_id}")
            return

        await self._execute_tool_call(
            tool_call_id=event["toolCallId"],
            tool_name=event["toolName"],
            args=event.get("args", {}),
            run_id=event.get("runId", ""),
            haseef_id=conn.haseef_id,
            haseef_entity_id=haseef_entity_id,
        )

    async def _execute_tool_call(
        self,
        *,
        tool_call_id: str,
        tool_name: str,
        args: dict[str, Any],
        run_id: str,
        haseef_id: str,
        haseef_entity_id: str,
    ) -> None:
        tool_def = self._tools.get(tool_name)
        if not tool_def:
            self._log(f"Unknown tool: {tool_name} (callId={tool_call_id})")
            await self._client.return_tool_result(
                haseef_id, tool_call_id, {"error": f"Unknown tool: {tool_name}"}
            )
            return

        self._log(f"Tool call: {tool_name} (callId={tool_call_id})")

        ctx = ToolCallContext(
            haseef_id=haseef_id,
            haseef_entity_id=haseef_entity_id,
            run_id=run_id,
            tool_call_id=tool_call_id,
            _push_sense=self._client.push_sense_event,
        )

        try:
            result = await tool_def.execute(args, ctx)
        except Exception as exc:
            self._log(f"Tool execution error ({tool_name}): {exc}")
            result = {"error": str(exc)}

        await self._client.return_tool_result(haseef_id, tool_call_id, result)
