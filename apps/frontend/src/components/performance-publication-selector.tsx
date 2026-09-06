import { publicationOptionLabel } from "../lib/performance.form";
import type { PublicationRecord } from "../lib/publication.types";

export function PerformancePublicationSelector({
  items,
  value,
  hasDataById,
  disabled,
  onChange,
}: {
  items: PublicationRecord[];
  value: string;
  hasDataById: Record<string, boolean>;
  disabled?: boolean;
  onChange: (publicationId: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor="performance-publication">
        已发布作品
      </label>
      <select
        id="performance-publication"
        className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">请选择已发布作品</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {publicationOptionLabel(item, hasDataById[item.id])}
          </option>
        ))}
      </select>
    </div>
  );
}
