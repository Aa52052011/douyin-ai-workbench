import type { IntakeMessage, IntakeSuggestion } from "../../lib/product-intake.types";
import type { MarketIntakeMessage, MarketIntakeSuggestion } from "../../lib/market-intake.types";

function formatSuggestionValue(value: IntakeSuggestion["value"] | MarketIntakeSuggestion["value"]): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          if ("displayName" in item) return String((item as { displayName: string }).displayName);
          if ("url" in item) return String((item as { url: string }).url);
        }
        return String(item);
      })
      .join("、");
  }
  if (value && typeof value === "object") {
    if ("displayName" in value) return String((value as { displayName: string }).displayName);
    if ("url" in value) return String((value as { url: string }).url);
  }
  return String(value ?? "");
}

export function IntakeMessageBubble({
  message,
  onAdoptSuggestion,
  onIgnoreSuggestion,
}: {
  message: IntakeMessage | MarketIntakeMessage;
  onAdoptSuggestion?: (messageId: string, suggestion: IntakeSuggestion | MarketIntakeSuggestion) => void;
  onIgnoreSuggestion?: (messageId: string, suggestionId: string) => void;
}) {
  const isUser = message.role === "user";
  const pendingSuggestions = ("suggestions" in message ? message.suggestions ?? [] : []).filter(
    (item) => !item.status || item.status === "pending",
  );

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[90%] space-y-2 ${isUser ? "" : ""}`}>
        <div
          className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
            isUser ? "bg-neutral-950 text-white" : "bg-neutral-100 text-neutral-900"
          }`}
        >
          {message.content}
        </div>
        {!isUser && pendingSuggestions.length > 0 ? (
          <ul className="space-y-2">
            {pendingSuggestions.map((suggestion) => (
              <li
                key={suggestion.id}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
              >
                <p className="font-medium">{suggestion.label ?? `建议：${suggestion.field}`}</p>
                <p className="mt-1 text-neutral-600">{formatSuggestionValue(suggestion.value)}</p>
                {"rationale" in suggestion && suggestion.rationale ? (
                  <p className="mt-1 text-xs text-neutral-500">{suggestion.rationale}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="rounded-md bg-neutral-950 px-3 py-1 text-xs text-white"
                    type="button"
                    onClick={() => onAdoptSuggestion?.(message.id, suggestion)}
                  >
                    采用
                  </button>
                  <button
                    className="rounded-md border px-3 py-1 text-xs"
                    type="button"
                    onClick={() => onIgnoreSuggestion?.(message.id, suggestion.id)}
                  >
                    忽略
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
