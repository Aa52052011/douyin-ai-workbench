import { useEffect, useRef } from "react";
import type { MarketIntakeMessage, MarketIntakeSuggestion } from "../../lib/market-intake.types";
import { IntakeComposer } from "./intake-composer";
import { IntakeMessageBubble } from "./intake-message-bubble";

export function MarketIntakeConversation({
  messages,
  disabled,
  onSend,
  onAcknowledgeNoData,
  showNoDataAction,
  onOpenImport,
  onAdoptSuggestion,
  onIgnoreSuggestion,
  turnError,
  onRetryTurn,
}: {
  messages: MarketIntakeMessage[];
  disabled?: boolean;
  onSend: (content: string) => void;
  onAcknowledgeNoData?: () => void;
  showNoDataAction?: boolean;
  onOpenImport?: () => void;
  onAdoptSuggestion?: (messageId: string, suggestion: MarketIntakeSuggestion) => void;
  onIgnoreSuggestion?: (messageId: string, suggestionId: string) => void;
  turnError?: string | null;
  onRetryTurn?: () => void;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-medium">AI 引导</h2>
        <p className="mt-0.5 text-xs text-neutral-500">不需要拥有竞品后台数据；右侧可随时手动补充。</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.map((message) => (
          <IntakeMessageBubble
            key={message.id}
            message={message}
            onAdoptSuggestion={onAdoptSuggestion}
            onIgnoreSuggestion={onIgnoreSuggestion}
          />
        ))}
        <div ref={endRef} />
      </div>
      {turnError ? (
        <div className="mx-4 mb-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950" role="alert">
          <p>{turnError}</p>
          {onRetryTurn ? (
            <button className="mt-2 rounded-md border px-3 py-1 text-xs" type="button" disabled={disabled} onClick={onRetryTurn}>
              重试
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-2 border-t border-neutral-100 px-4 py-3">
        {showNoDataAction && onAcknowledgeNoData ? (
          <button
            className="w-full rounded-md border border-dashed border-neutral-300 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
            type="button"
            disabled={disabled}
            onClick={onAcknowledgeNoData}
          >
            我暂时没有市场数据
          </button>
        ) : null}
        {onOpenImport ? (
          <button
            className="w-full rounded-md border px-3 py-2 text-left text-sm text-neutral-600 hover:bg-neutral-50"
            type="button"
            disabled={disabled}
            onClick={onOpenImport}
          >
            导入已有市场数据（可选）
          </button>
        ) : null}
        <p className="text-xs text-neutral-500">如果你已有第三方平台或自己整理的 CSV/XLSX，可以补充导入。</p>
      </div>
      <div className="px-4 pb-4">
        <IntakeComposer
          disabled={disabled}
          onSend={onSend}
          inputId="market-intake-composer"
          placeholder="说说关键词、竞品或你的市场观察…"
        />
      </div>
    </section>
  );
}
