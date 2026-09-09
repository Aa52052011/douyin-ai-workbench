import { useEffect, useRef } from "react";
import type { IntakeMessage, IntakeSuggestion } from "../../lib/product-intake.types";
import { IntakeComposer } from "./intake-composer";
import { IntakeMessageBubble } from "./intake-message-bubble";

export function IntakeConversation({
  messages,
  disabled,
  turnError,
  onSend,
  onRetry,
  onAdoptSuggestion,
  onIgnoreSuggestion,
}: {
  messages: IntakeMessage[];
  disabled?: boolean;
  turnError?: string | null;
  onSend: (content: string) => void;
  onRetry?: () => void;
  onAdoptSuggestion?: (messageId: string, suggestion: IntakeSuggestion) => void;
  onIgnoreSuggestion?: (messageId: string, suggestionId: string) => void;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, turnError]);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-medium">AI 引导</h2>
        <p className="mt-0.5 text-xs text-neutral-500">用自然语言补充产品事实；右侧可随时手动修改。</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.map((message) => (
          <IntakeMessageBubble
            key={message.id}
            message={message}
            onAdoptSuggestion={
              onAdoptSuggestion
                ? (messageId, suggestion) => onAdoptSuggestion(messageId, suggestion as IntakeSuggestion)
                : undefined
            }
            onIgnoreSuggestion={onIgnoreSuggestion}
          />
        ))}
        {turnError ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="alert">
            <p>{turnError}</p>
            {onRetry ? (
              <button className="mt-2 rounded-md border border-amber-300 bg-white px-3 py-1 text-xs" type="button" onClick={onRetry}>
                重试
              </button>
            ) : null}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      <div className="px-4 pb-4">
        <IntakeComposer disabled={disabled} onSend={onSend} />
      </div>
    </section>
  );
}
