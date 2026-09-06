import { useState } from "react";
import { api } from "../lib/api";
import type { Project } from "../lib/types";

export function CreateProjectForm({
  accessToken,
  onCreated,
}: {
  accessToken: string;
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [platform, setPlatform] = useState("");
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
        body: JSON.stringify({ name, industry, platform }),
      });
      setName("");
      setIndustry("");
      setPlatform("");
      onCreated(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap" onSubmit={(event) => void onSubmit(event)}>
      <input
        className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm sm:w-auto sm:min-w-[10rem]"
        placeholder="项目名称"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <input
        className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm sm:w-auto sm:min-w-[8rem]"
        placeholder="行业"
        value={industry}
        onChange={(event) => setIndustry(event.target.value)}
      />
      <input
        className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm sm:w-auto sm:min-w-[8rem]"
        placeholder="平台"
        value={platform}
        onChange={(event) => setPlatform(event.target.value)}
      />
      <button className="w-full rounded-md bg-neutral-950 px-4 py-2 text-sm text-white sm:w-auto" disabled={pending} type="submit">
        {pending ? "创建中…" : "创建项目"}
      </button>
      {error ? <p className="w-full text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
