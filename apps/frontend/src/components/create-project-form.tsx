"use client";

import { useState } from "react";
import { api } from "../lib/api";
import {
  DEFAULT_PROJECT_PLATFORM,
  projectPlatformApiValue,
  type ProjectPlatformId,
} from "../lib/project-platform";
import type { Project } from "../lib/types";
import { Button } from "./ui/button";
import { InlineActionErrorV1 } from "./inline-action-error-v1";
import { ProjectPlatformSelect } from "./project-platform-select";

export function CreateProjectForm({
  accessToken,
  onCreated,
  submitVariant = "primary",
  layout = "compact",
  onCancel,
}: {
  accessToken: string;
  onCreated: (project: Project) => void;
  submitVariant?: "primary" | "secondary";
  layout?: "compact" | "panel";
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [platform, setPlatform] = useState<ProjectPlatformId>(DEFAULT_PROJECT_PLATFORM);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const project = await api<Project>("/projects", {
        method: "POST",
        accessToken,
        body: JSON.stringify({
          name,
          industry: industry.trim() || undefined,
          platform: projectPlatformApiValue(platform),
          description: description.trim() || undefined,
        }),
      });
      setName("");
      setIndustry("");
      setPlatform(DEFAULT_PROJECT_PLATFORM);
      setDescription("");
      onCreated(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    await submit();
  }

  const nameField = (
    <div className={layout === "panel" ? "min-w-0" : "min-w-0 flex-1 sm:min-w-[10rem]"}>
      <label className="mb-1 block text-sm font-medium" htmlFor="create-project-name">
        项目名称
      </label>
      <input
        id="create-project-name"
        className="acf-field w-full min-w-0 rounded-[var(--acf-radius-sm)] border border-[var(--acf-border)] bg-[var(--acf-surface-elevated)] px-3 py-2 text-sm"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
    </div>
  );

  const platformIndustry = (
    <>
      <ProjectPlatformSelect
        id="create-project-platform"
        className="min-w-0"
        value={platform}
        onChange={setPlatform}
        required
      />
      <div className="min-w-0">
        <label className="mb-1 block text-sm font-medium" htmlFor="create-project-industry">
          行业
        </label>
        <input
          id="create-project-industry"
          className="acf-field w-full min-w-0 rounded-[var(--acf-radius-sm)] border border-[var(--acf-border)] bg-[var(--acf-surface-elevated)] px-3 py-2 text-sm"
          value={industry}
          onChange={(event) => setIndustry(event.target.value)}
        />
      </div>
    </>
  );

  const descriptionField = (
    <div className="min-w-0">
      <label className="mb-1 block text-sm font-medium" htmlFor="create-project-description">
        描述
      </label>
      <textarea
        id="create-project-description"
        className="acf-field w-full min-w-0 rounded-[var(--acf-radius-sm)] border border-[var(--acf-border)] bg-[var(--acf-surface-elevated)] px-3 py-2 text-sm"
        rows={2}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
    </div>
  );

  const submitButton = (
    <Button type="submit" variant={submitVariant} disabled={pending} className={layout === "panel" ? undefined : "w-full sm:w-auto"}>
      {pending ? "正在创建项目…" : "创建项目"}
    </Button>
  );

  const errorBlock = error ? (
    <InlineActionErrorV1
      message="项目创建失败，请重试。"
      technicalDetails={error}
      onRetry={() => void submit()}
    />
  ) : null;

  if (layout === "panel") {
    return (
      <form className="flex w-full min-w-0 flex-col gap-3" onSubmit={(event) => void onSubmit(event)}>
        {nameField}
        <div className="grid min-w-0 gap-3 md:grid-cols-2">{platformIndustry}</div>
        {descriptionField}
        {errorBlock}
        <div className="flex flex-wrap justify-end gap-2">
          {onCancel ? (
            <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
              取消
            </Button>
          ) : null}
          {submitButton}
        </div>
      </form>
    );
  }

  return (
    <form className="flex w-full min-w-0 flex-col gap-3" onSubmit={(event) => void onSubmit(event)}>
      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        {nameField}
        {platformIndustry}
        {submitButton}
      </div>
      {descriptionField}
      {errorBlock}
    </form>
  );
}
