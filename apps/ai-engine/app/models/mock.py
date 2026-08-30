from app.schemas.execute import TokenUsage


class MockModelProvider:
    id = "mock"

    def generate(self, prompt: str, system_prompt: str = "") -> tuple[str, TokenUsage]:
        text = prompt
        combined = f"{system_prompt}\n{prompt}"
        input_tokens = max(1, (len(combined) + 3) // 4)
        output_tokens = max(1, (len(text) + 3) // 4)
        return text, TokenUsage(
            inputTokens=input_tokens,
            outputTokens=output_tokens,
            totalTokens=input_tokens + output_tokens,
            estimatedCost=0,
        )
