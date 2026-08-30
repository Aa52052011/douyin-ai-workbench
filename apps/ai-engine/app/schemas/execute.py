from typing import Any, Literal

from pydantic import BaseModel, Field


class AgentContextDto(BaseModel):
    userId: str
    tenantId: str
    workspaceId: str
    projectId: str
    requestId: str
    locale: str = "zh-CN"


class InternalAgentRequest(BaseModel):
    requestId: str
    agentId: str
    agentVersion: str
    context: AgentContextDto
    input: dict[str, Any]


class TokenUsage(BaseModel):
    inputTokens: int = 0
    outputTokens: int = 0
    totalTokens: int = 0
    estimatedCost: float = 0


class InternalAgentError(BaseModel):
    code: str
    message: str
    retryable: bool = False


class InternalAgentResponse(BaseModel):
    status: Literal["COMPLETED", "FAILED"]
    output: dict[str, Any] | None = None
    usage: TokenUsage | None = None
    error: InternalAgentError | None = None


class EchoInput(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
