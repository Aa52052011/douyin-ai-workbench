"use client";

import { Button } from "./button";

export function AIRecommendation({
  value,
  reason,
  onAccept,
  onEdit,
  onChooseAlternative,
}: {
  value: string;
  reason?: string;
  onAccept: () => void;
  onEdit: () => void;
  onChooseAlternative?: () => void;
}) {
  return (
    <div className="rounded-[var(--acf-radius-sm)] border border-[var(--acf-border)] bg-[var(--acf-surface-subtle)] px-3 py-2">
      <p className="text-sm">根据前置信息推荐：{value}</p>
      {reason ? <p className="acf-caption mt-1">{reason}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" onClick={onAccept}>
          采用推荐
        </Button>
        <Button size="sm" variant="secondary" onClick={onEdit}>
          自行修改
        </Button>
        {onChooseAlternative ? (
          <Button size="sm" variant="ghost" onClick={onChooseAlternative}>
            看其他选项
          </Button>
        ) : null}
      </div>
    </div>
  );
}
