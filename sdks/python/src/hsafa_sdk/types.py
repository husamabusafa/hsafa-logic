from typing import TypedDict, Dict, Any, List, Optional, Callable, Awaitable, Union


class SdkOptions(TypedDict, total=False):
    core_url: str
    api_key: str
    skill: str
    api_base: Optional[str]


class ToolDefinition(TypedDict, total=False):
    name: str
    description: str
    input: Optional[Dict[str, str]]
    inputSchema: Optional[Any]


class HaseefContext(TypedDict):
    id: str
    name: str
    profile: Dict[str, Any]


class ToolCallContext(TypedDict):
    actionId: str
    haseef: HaseefContext


ToolHandler = Callable[[Dict[str, Any], ToolCallContext], Awaitable[Any]]


class Attachment(TypedDict, total=False):
    type: str  # 'image' | 'audio' | 'file'
    mimeType: str
    url: Optional[str]
    base64: Optional[str]
    name: Optional[str]


class PushEventPayload(TypedDict, total=False):
    type: str
    data: Dict[str, Any]
    attachments: Optional[List[Attachment]]
    haseefId: Optional[str]
    target: Optional[Dict[str, str]]


# ── Lifecycle Events ───────────────────────────────────────────────────────────

class ToolInputStartEvent(TypedDict):
    actionId: str
    toolName: str
    haseef: HaseefContext


class ToolInputDeltaEvent(TypedDict):
    actionId: str
    toolName: str
    delta: str
    partialArgs: Dict[str, Any]
    haseef: HaseefContext


class ToolCallEvent(TypedDict):
    actionId: str
    toolName: str
    args: Dict[str, Any]
    haseef: HaseefContext


class ToolResultEvent(TypedDict):
    actionId: str
    toolName: str
    args: Dict[str, Any]
    result: Any
    durationMs: int
    haseef: HaseefContext


class ToolErrorEvent(TypedDict):
    actionId: str
    toolName: str
    error: str
    haseef: HaseefContext


class RunStartedEvent(TypedDict):
    runId: str
    haseef: Dict[str, str]
    triggerSkill: Optional[str]
    triggerType: Optional[str]


class RunCompletedEvent(TypedDict):
    runId: str
    haseef: Dict[str, str]
    summary: Optional[str]
    durationMs: int


SdkEventType = Union[
    str,
]

SdkEventMap = Dict[str, Any]


# ── Haseef API ───────────────────────────────────────────────────────────────

class Haseef(TypedDict, total=False):
    id: str
    name: str
    description: Optional[str]
    profileJson: Optional[Dict[str, Any]]
    configJson: Optional[Dict[str, Any]]
    skills: Optional[List[str]]
    createdAt: Optional[str]
    updatedAt: Optional[str]


class CreateHaseefInput(TypedDict, total=False):
    name: str
    description: Optional[str]
    configJson: Dict[str, Any]
    profileJson: Optional[Dict[str, Any]]
    skills: Optional[List[str]]


class UpdateHaseefInput(TypedDict, total=False):
    name: Optional[str]
    description: Optional[str]
    configJson: Optional[Dict[str, Any]]
    profileJson: Optional[Dict[str, Any]]
    skills: Optional[List[str]]


# ── Memory API ───────────────────────────────────────────────────────────────

class SemanticMemoryInput(TypedDict, total=False):
    key: str
    value: str
    importance: Optional[int]


class SemanticMemory(TypedDict):
    id: str
    haseefId: str
    key: str
    value: str
    importance: int
    recalledAt: Optional[str]
    createdAt: str
    updatedAt: str


class EpisodicMemory(TypedDict):
    id: str
    haseefId: str
    runId: Optional[str]
    summary: str
    context: Optional[Dict[str, Any]]
    createdAt: str


class SocialMemory(TypedDict):
    id: str
    haseefId: str
    personKey: str
    observations: Any
    updatedAt: str


class ProceduralMemory(TypedDict):
    id: str
    haseefId: str
    pattern: str
    confidence: float
    updatedAt: str


class MemoryStats(TypedDict):
    haseefId: str
    counts: Dict[str, int]
    total: int


# ── Runs API ───────────────────────────────────────────────────────────────────

class Run(TypedDict, total=False):
    id: str
    haseefId: str
    status: str
    triggerSkill: Optional[str]
    triggerType: Optional[str]
    startedAt: str
    completedAt: Optional[str]
    durationMs: Optional[int]
    summary: Optional[str]
    tokensUsed: Optional[int]
    toolCallCount: Optional[int]


class ListRunsOptions(TypedDict, total=False):
    haseefId: Optional[str]
    status: Optional[str]
    limit: Optional[int]
