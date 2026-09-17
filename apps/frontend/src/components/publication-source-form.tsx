import type { VideoRecord } from "../lib/video.types";
import { videoOptionLabel } from "../lib/publication.form";

export function PublicationSourceForm({
  videoId,
  videos,
  pending,
  onChange,
}: {
  videoId: string;
  videos: VideoRecord[];
  pending: boolean;
  onChange: (videoId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4">
      <label className="mb-1 block text-sm font-medium" htmlFor="publish-video">
        视频
      </label>
      <select
        id="publish-video"
        className="w-full min-w-0 rounded-md border border-[var(--acf-border)] bg-[var(--acf-surface-elevated)] px-3 py-2 text-sm"
        value={videoId}
        disabled={pending}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">请选择已确认的最终成片</option>
        {videos.map((video) => (
          <option key={video.id} value={video.id}>
            {videoOptionLabel(video)}
          </option>
        ))}
      </select>
    </div>
  );
}
