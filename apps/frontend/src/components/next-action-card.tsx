import type { PresentedNextAction } from "../lib/ux/next-action-v2";
import Link from "next/link";
import { Card } from "./ui/card";

export function NextActionCard({ action }: { action: PresentedNextAction }) {
  return (
    <Card className="mb-6" data-acf-next-action>
      <p className="acf-caption">当前最重要的一步</p>
      <p className="acf-card-title mt-1">{action.label}</p>
      {action.description ? <p className="acf-body-secondary mt-1">{action.description}</p> : null}
      <p className="acf-caption mt-2">{action.stepCopy}</p>
      <Link
        className="mt-3 inline-flex rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand)] px-3 py-1.5 text-sm text-white"
        href={action.href}
      >
        {action.ctaLabel ?? action.label}
      </Link>
    </Card>
  );
}
