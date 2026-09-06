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
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <label className="mb-1 block text-sm font-medium" htmlFor="publish-video">
        视频
      </label>
      <select
        id="publish-video"
        className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
        value={videoId}
        disabled={pending}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">请选择已完成的视频</option>
        {videos.map((video) => (
          <option key={video.id} value={video.id}>
            {videoOptionLabel(video)}
          </option>
        ))}
      </select>
    </div>
  );
}
