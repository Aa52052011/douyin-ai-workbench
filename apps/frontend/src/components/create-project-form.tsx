"use client";

import { useState } from "react";
import { api } from "../lib/api";
import {
  DEFAULT_PROJECT_PLATFORM,
  projectPlatformApiValue,
  type ProjectPlatformId,
} from "../lib/project-platform";
import type { Project } from "../lib/types";
import { ProjectPlatformSelect } from "./project-platform-select";

export function CreateProjectForm({
  accessToken,
  onCreated,
}: {
  accessToken: string;
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [platform, setPlatform] = useState<ProjectPlatformId>(DEFAULT_PROJECT_PLATFORM);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
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

  return (
    <form className="flex w-full min-w-0 flex-col gap-3" onSubmit={(event) => void onSubmit(event)}>
      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 flex-1 sm:min-w-[10rem]">
          <label className="mb-1 block text-sm font-medium" htmlFor="create-project-name">
            项目名称
          </label>
          <input
            id="create-project-name"
            className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <ProjectPlatformSelect
          id="create-project-platform"
          className="min-w-0 sm:w-auto"
          value={platform}
          onChange={setPlatform}
          required
        />
        <div className="min-w-0 sm:min-w-[8rem]">
          <label className="mb-1 block text-sm font-medium" htmlFor="create-project-industry">
            行业
          </label>
          <input
            id="create-project-industry"
            className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
          />
        </div>
        <button className="w-full rounded-md bg-neutral-950 px-4 py-2 text-sm text-white sm:w-auto" disabled={pending} type="submit">
          {pending ? "创建中…" : "创建项目"}
        </button>
      </div>
      <div className="min-w-0">
        <label className="mb-1 block text-sm font-medium" htmlFor="create-project-description">
          描述
        </label>
        <textarea
          id="create-project-description"
          className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      {error ? <p className="w-full text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
