import Link from "next/link";
import type { ConfidenceActionView } from "../lib/confidence-action";

/**
 * Neutral / caution confidence card — not destructive, not a hard block.
 */
export function ConfidenceActionCard({
  view,
  continueLabel,
  continueHref,
}: {
  view: ConfidenceActionView;
  continueLabel?: string;
  continueHref?: string;
}) {
  const tone =
    view.level === "low"
      ? "border-amber-200 bg-amber-50/80"
      : view.level === "medium"
        ? "border-neutral-200 bg-neutral-50"
        : "border-neutral-200 bg-white";

  return (
    <section className={`rounded-xl border px-4 py-3 ${tone}`} aria-label={view.label}>
      <p className="text-sm font-medium text-neutral-900">{view.label}</p>
      {view.framingNote ? <p className="mt-1 text-sm text-neutral-800">{view.framingNote}</p> : null}
      {view.reasonSummary ? (
        <p className="mt-2 text-sm leading-6 text-neutral-700">
          <span className="text-neutral-500">原因：</span>
          {view.reasonSummary}
        </p>
      ) : null}

      {view.recommendedActions.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-neutral-600">你可以：</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-neutral-800">
            {view.recommendedActions.map((action) => (
              <li key={action.id}>
                {action.href ? (
                  <Link className="underline underline-offset-2 hover:text-neutral-950" href={action.href}>
                    {action.label}
                  </Link>
                ) : (
                  <span>{action.label}</span>
                )}
                {action.description ? (
                  <span className="text-neutral-500"> — {action.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(continueHref && continueLabel) || view.level === "low" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {continueHref && continueLabel ? (
            <Link
              className="rounded-md bg-neutral-950 px-3 py-1.5 text-sm text-white"
              href={continueHref}
            >
              {continueLabel}
            </Link>
          ) : null}
          {view.recommendedActions.find((a) => a.id === "add-keywords" || a.id === "add-competitors")?.href ? (
            <Link
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800"
              href={
                view.recommendedActions.find((a) => a.href)?.href ??
                "#"
              }
            >
              补充市场信息
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
