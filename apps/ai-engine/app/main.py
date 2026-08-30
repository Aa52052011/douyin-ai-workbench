from fastapi import Depends, FastAPI
from pydantic import ValidationError

from app.agents.registry import execute_registered
from app.core.auth import require_internal_secret
from app.schemas.execute import InternalAgentError, InternalAgentRequest, InternalAgentResponse

app = FastAPI(title="AI Content Factory Engine", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "ai-engine", "status": "ok"}


@app.post("/internal/agent/execute", response_model=InternalAgentResponse)
def execute_agent(
    payload: InternalAgentRequest,
    _: None = Depends(require_internal_secret),
) -> InternalAgentResponse:
    try:
        return execute_registered(payload)
    except ValidationError:
        return InternalAgentResponse(
            status="FAILED",
            error=InternalAgentError(
                code="AGENT_INVALID_INPUT",
                message="Agent input is invalid",
                retryable=False,
            ),
        )
