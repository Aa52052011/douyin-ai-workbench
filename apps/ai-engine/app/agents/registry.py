from pydantic import ValidationError

from app.agents.echo import ECHO_AGENT_ID, ECHO_AGENT_VERSION, execute_echo
from app.schemas.execute import InternalAgentError, InternalAgentRequest, InternalAgentResponse


def execute_registered(request: InternalAgentRequest) -> InternalAgentResponse:
    if request.agentId != ECHO_AGENT_ID or request.agentVersion != ECHO_AGENT_VERSION:
        return InternalAgentResponse(
            status="FAILED",
            error=InternalAgentError(
                code="AGENT_NOT_FOUND",
                message="Agent not found",
                retryable=False,
            ),
        )
    try:
        return execute_echo(request)
    except ValidationError:
        return InternalAgentResponse(
            status="FAILED",
            error=InternalAgentError(
                code="AGENT_INVALID_INPUT",
                message="Agent input is invalid",
                retryable=False,
            ),
        )
