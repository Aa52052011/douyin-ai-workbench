import { useState } from "react";
import { api } from "../lib/api";
import type { Project } from "../lib/types";

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
  const [platform, setPlatform] = useState(project.platform ?? "");
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
        body: JSON.stringify({ name, industry, platform, description }),
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <form
        className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-xl bg-white p-5 shadow-lg"
        role="dialog"
        aria-modal="true"
        onSubmit={(event) => void onSubmit(event)}
      >
        <h2 className="text-lg font-medium">编辑项目</h2>
        <input
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <input
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="行业"
          value={industry}
          onChange={(event) => setIndustry(event.target.value)}
        />
        <input
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="平台"
          value={platform}
          onChange={(event) => setPlatform(event.target.value)}
        />
        <textarea
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="描述"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={onClose}>
            取消
          </button>
          <button className="rounded-md bg-neutral-950 px-3 py-2 text-sm text-white" disabled={pending} type="submit">
            {pending ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}
