from app.models.mock import MockModelProvider
from app.schemas.execute import TokenUsage


class ModelRouter:
    def __init__(self) -> None:
        self._default = MockModelProvider()

    def generate(self, prompt: str, system_prompt: str = "") -> tuple[str, TokenUsage]:
        return self._default.generate(prompt, system_prompt)
