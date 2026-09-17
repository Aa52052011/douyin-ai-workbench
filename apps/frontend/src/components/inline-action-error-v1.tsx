"use client";

import { Button } from "./ui/button";
import { TechnicalDetailsPanel } from "./technical-details-panel";

export function InlineActionErrorV1({
  message,
  onRetry,
  technicalDetails,
}: {
  message: string;
  onRetry?: () => void;
  technicalDetails?: string;
}) {
  return (
    <div className="mt-2 rounded-[var(--acf-radius-sm)] bg-[var(--acf-danger-soft)] px-3 py-2 text-sm text-[var(--acf-danger)]" role="alert" data-acf-inline-action-error>
      <p>{message}</p>
      {onRetry ? (
        <Button className="mt-2" size="sm" type="button" variant="secondary" onClick={onRetry}>
          重试
        </Button>
      ) : null}
      {technicalDetails ? <TechnicalDetailsPanel details={technicalDetails} /> : null}
    </div>
  );
}
