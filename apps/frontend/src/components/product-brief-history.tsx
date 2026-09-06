import { useState } from "react";
import { isNotFoundError } from "../lib/api";
import { getProductBriefById } from "../lib/product-brief.api";
import type { ProductBriefRecord } from "../lib/product-brief.types";
import { ProductBriefSummary } from "./product-brief-summary";

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function ProductBriefHistory({
  items,
  accessToken,
}: {
  items: ProductBriefRecord[];
  accessToken: string;
}) {
  const [viewing, setViewing] = useState<ProductBriefRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  if (items.length === 0) {
    return null;
  }

  async function open(item: ProductBriefRecord) {
    setError(null);
    setLoadingId(item.id);
    try {
      const detail = await getProductBriefById(accessToken, item.id);
      setViewing(detail);
    } catch (err) {
      setError(isNotFoundError(err) ? "该版本不存在或你没有访问权限" : "暂时无法查看这个版本");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <section className="mt-8">
      <details>
        <summary className="cursor-pointer text-sm font-medium">历史版本</summary>
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2">
              <div className="min-w-0 text-sm">
                <p className="font-medium">版本 {item.version}</p>
                <p className="text-neutral-500">{formatTime(item.createdAt)}</p>
                <p className="truncate text-neutral-600">{item.payload.productName}</p>
                <p className="line-clamp-1 text-neutral-500">{item.payload.businessGoal}</p>
              </div>
              <button
                className="rounded-md border px-3 py-1.5 text-sm"
                type="button"
                disabled={loadingId === item.id}
                onClick={() => void open(item)}
              >
                {loadingId === item.id ? "打开中…" : "查看"}
              </button>
            </li>
          ))}
        </ul>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </details>
      {viewing ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium">版本 {viewing.version}</h2>
                <p className="text-sm text-neutral-500">{formatTime(viewing.createdAt)}</p>
              </div>
              <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={() => setViewing(null)}>
                关闭
              </button>
            </div>
            <ProductBriefSummary payload={viewing.payload} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
