"use client";

import { useState } from "react";
import { api } from "../lib/api";
import { projectPlatformApiValue, projectPlatformSelectValue, type ProjectPlatformId } from "../lib/project-platform";
import type { Project } from "../lib/types";
import { ProjectPlatformSelect } from "./project-platform-select";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { FormField } from "./ui/form-field";
import { Input, Textarea } from "./ui/input";
import { toProductError } from "../lib/ux/product-error";

export function EditProjectPanel({
  project,
  accessToken,
  onSaved,
  onClose,
}: {
  project: Project;
  accessToken: string;
  onSaved: (project: Project) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [industry, setIndustry] = useState(project.industry ?? "");
  const [platform, setPlatform] = useState<ProjectPlatformId>(projectPlatformSelectValue(project.platform));
  const [description, setDescription] = useState(project.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const saved = await api<Project>(`/projects/${project.id}`, {
        method: "PATCH",
        accessToken,
        body: JSON.stringify({
          name,
          industry: industry.trim() || undefined,
          platform: projectPlatformApiValue(platform),
          description: description.trim() || undefined,
        }),
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(toProductError(err, "没能保存项目").humanMessage);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open title="编辑项目" onClose={onClose} description="修改名称、平台和说明。">
      <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
        <FormField label="项目名称" htmlFor="edit-project-name" required>
          <Input
            id="edit-project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </FormField>
        <ProjectPlatformSelect id="edit-project-platform" value={platform} onChange={setPlatform} required />
        <FormField label="行业" htmlFor="edit-project-industry" optional>
          <Input
            id="edit-project-industry"
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
          />
        </FormField>
        <FormField label="描述" htmlFor="edit-project-description" optional>
          <Textarea
            id="edit-project-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormField>
        {error ? <p className="text-sm text-[var(--acf-danger)]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" loading={pending}>
            保存
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
