from app.models.router import ModelRouter
from app.schemas.execute import EchoInput, InternalAgentRequest, InternalAgentResponse
from app.tools.registry import ToolRegistry

ECHO_AGENT_ID = "system.echo"
ECHO_AGENT_VERSION = "v1"

_models = ModelRouter()
_tools = ToolRegistry()


def execute_echo(request: InternalAgentRequest) -> InternalAgentResponse:
    parsed = EchoInput.model_validate(request.input)
    _text, usage = _models.generate(parsed.message, system_prompt="system.echo:v1")
    _tools.invoke("echoTool", message=parsed.message)
    return InternalAgentResponse(
        status="COMPLETED",
        output={
            "message": parsed.message,
            "agent": ECHO_AGENT_ID,
            "version": ECHO_AGENT_VERSION,
        },
        usage=usage,
    )
