import type { PresentedNextAction } from "../lib/ux/next-action-v2";
import Link from "next/link";
import { ActionCard } from "./ui/card";

export function NextActionCard({
  action,
  stageLabel,
  ctaLabel = "继续下一步",
}: {
  action: PresentedNextAction;
  stageLabel?: string;
  ctaLabel?: string;
}) {
  return (
    <ActionCard className="acf-stage-current mb-6" data-acf-next-action data-acf-current-stage>
      <p className="acf-caption">当前阶段</p>
      {stageLabel ? <p className="acf-card-title mt-1">{stageLabel}</p> : <p className="acf-card-title mt-1">{action.label}</p>}
      {action.description ? <p className="acf-body-secondary mt-1">{action.description}</p> : null}
      <p className="acf-body-secondary mt-2">下一步：{action.label}</p>
      <Link
        className="mt-3 inline-flex min-h-9 items-center rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand)] px-4 text-sm text-[var(--acf-text-inverse)]"
        href={action.href}
        aria-label={ctaLabel}
      >
        {ctaLabel}
      </Link>
    </ActionCard>
  );
}
