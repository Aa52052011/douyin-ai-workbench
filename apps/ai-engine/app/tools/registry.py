from collections.abc import Callable

from app.tools.echo import echo_tool


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Callable[..., object]] = {"echoTool": echo_tool}

    def invoke(self, name: str, **kwargs: object) -> object:
        tool = self._tools.get(name)
        if tool is None:
            raise KeyError(name)
        return tool(**kwargs)
