"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { useProjectWorkspace } from "../lib/project-workspace-context";
import { StagePlaceholder } from "./stage-placeholder";

export function ProjectStagePage({
  title,
  description,
  emptyTitle,
  loadPresent,
  primaryAction,
  legacyHref,
  legacyLabel,
}: {
  title: string;
  description: string;
  emptyTitle: string;
  loadPresent?: (accessToken: string, projectId: string) => Promise<boolean>;
  primaryAction?: { href: string; label: string };
  legacyHref?: string;
  legacyLabel?: string;
}) {
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [present, setPresent] = useState<boolean | null>(null);

  useEffect(() => {
    if (!accessToken || !loadPresent) {
      return;
    }
    let cancelled = false;
    void loadPresent(accessToken, project.id)
      .then((value) => {
        if (!cancelled) {
          setPresent(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPresent(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, loadPresent, project.id]);

  const status = !loadPresent
    ? "暂无法判断"
    : present === true
      ? "已有记录"
      : present === false
        ? "尚未开始"
        : "状态待确认";

  return (
    <StagePlaceholder
      title={title}
      description={description}
      projectName={project.name}
      status={status}
      emptyTitle={present ? `已有${title}` : emptyTitle}
      primaryAction={
        primaryAction ??
        (legacyHref && legacyLabel
          ? { href: legacyHref, label: legacyLabel }
          : { href: `/dashboard/projects/${project.id}`, label: "返回项目概览" })
      }
      legacyHref={legacyHref}
      legacyLabel={legacyLabel}
    />
  );
}
