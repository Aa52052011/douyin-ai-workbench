import type { ScriptRecord } from "../lib/script.types";
import { scriptOptionLabel } from "../lib/video.form";

export function VideoSourceForm({
  scriptId,
  scripts,
  pending,
  onChange,
}: {
  scriptId: string;
  scripts: ScriptRecord[];
  pending: boolean;
  onChange: (scriptId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <label className="mb-1 block text-sm font-medium" htmlFor="video-script">
        脚本
      </label>
      <select
        id="video-script"
        className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
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
}
