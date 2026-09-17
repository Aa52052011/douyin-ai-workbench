import type { ScriptRecord } from "../lib/script.types";
import { scriptOptionLabel } from "../lib/video.form";

export function VideoSourceForm({
  scriptId,
  scripts,
  pending,
  onChange,
  collapsed = false,
}: {
  scriptId: string;
  scripts: ScriptRecord[];
  pending: boolean;
  onChange: (scriptId: string) => void;
  collapsed?: boolean;
}) {
  const body = (
    <div className="rounded-xl border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4">
      <p className="mb-2 text-sm text-neutral-600">已带入当前脚本、选题和项目，无需再填行业或平台。</p>
      <label className="mb-1 block text-sm font-medium" htmlFor="video-script">
        脚本
      </label>
      <select
        id="video-script"
        className="w-full min-w-0 rounded-md border border-[var(--acf-border)] bg-[var(--acf-surface-elevated)] px-3 py-2 text-sm"
        value={scriptId}
        disabled={pending}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">请选择已确认的脚本</option>
        {scripts.map((script) => (
          <option key={script.id} value={script.id}>
            {scriptOptionLabel(script)}
          </option>
        ))}
      </select>
    </div>
  );
  if (collapsed && scriptId) {
    return (
      <details>
        <summary className="cursor-pointer text-sm text-neutral-600">更换脚本</summary>
        <div className="mt-3">{body}</div>
      </details>
    );
  }
  return body;
}
