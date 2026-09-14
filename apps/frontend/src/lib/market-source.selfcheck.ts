import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMarketResearchContext,
  classifyMarketUrl,
  canonicalizeUrl,
  createSourceId,
  marketSourceRoleLabel,
  marketSourceTypeLabel,
  sourceDedupeKey,
  upsertMarketSource,
  type MarketSourceDraftEntry,
} from "./market-source";
import {
  emptyMarketIntakeDraft,
  getMarketIntakeReadiness,
  mapMarketIntakeDraftToManualPreview,
  mergeExtractedUrlSources,
  sanitizeMarketIntakeDraft,
} from "./market-intake";

const here = dirname(fileURLToPath(import.meta.url));

function entry(partial: Partial<MarketSourceDraftEntry>): MarketSourceDraftEntry {
  return {
    id: partial.id ?? createSourceId(),
    role: partial.role ?? "MARKET_EVIDENCE",
    sourceType: partial.sourceType ?? "KEYWORD",
    provenance: partial.provenance ?? "USER_PROVIDED",
    capturedAt: partial.capturedAt ?? "2026-09-09T00:00:00.000Z",
    ...partial,
  };
}

function run() {
  assert.equal(classifyMarketUrl("https://www.douyin.com/video/7123456789012345678").sourceType, "DOUYIN_VIDEO_URL");
  assert.equal(classifyMarketUrl("https://www.douyin.com/user/MS4wLjABAAAA").sourceType, "DOUYIN_ACCOUNT_URL");
  assert.equal(classifyMarketUrl("https://v.douyin.com/iAbCd/").sourceType, "DOUYIN_URL_UNKNOWN");
  assert.equal(classifyMarketUrl("https://example.com/x").sourceType, "WEB_URL");
  assert.equal(classifyMarketUrl("not a url").valid, false);
  assert.equal(canonicalizeUrl("https://www.douyin.com/video/1?utm_source=x").includes("utm_"), false);

  const url = "https://douyin.com/video/99";
  const roles = ["MARKET_EVIDENCE", "REFERENCE_CONTENT", "OWN_CONTENT"] as const;
  const keys = roles.map((role) => sourceDedupeKey(entry({ role, sourceType: "DOUYIN_VIDEO_URL", canonicalUrl: url })));
  assert.equal(new Set(keys).size, 3);

  let list: MarketSourceDraftEntry[] = [];
  const first = upsertMarketSource(list, entry({ role: "MARKET_EVIDENCE", sourceType: "DOUYIN_VIDEO_URL", canonicalUrl: url }));
  list = first.list;
  assert.equal(upsertMarketSource(list, entry({ role: "MARKET_EVIDENCE", sourceType: "DOUYIN_VIDEO_URL", canonicalUrl: url })).created, false);

  const draft = sanitizeMarketIntakeDraft({
    sources: [
      entry({ id: "e1", role: "MARKET_EVIDENCE", sourceType: "KEYWORD", keyword: "美甲获客" }),
      entry({ id: "r1", role: "REFERENCE_CONTENT", sourceType: "DOUYIN_VIDEO_URL", canonicalUrl: url, url }),
      entry({ id: "o1", role: "OWN_CONTENT", sourceType: "UPLOAD_VIDEO", assetId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      entry({ id: "p1", role: "PRODUCTION_ASSET", sourceType: "UPLOAD_VIDEO", assetId: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee" }),
    ],
  });
  assert.equal(draft.sources.some((s) => s.role === "PRODUCTION_ASSET"), false);
  assert.equal(getMarketIntakeReadiness(draft).readyForConfirmation, true);

  const mapped = mapMarketIntakeDraftToManualPreview(draft, { collectedAt: "2026-09-09T00:00:00.000Z" });
  assert.ok(mapped.items.some((i) => i.kind === "KEYWORD"));
  assert.equal(mapped.intakeSources?.some((s) => s.role === "REFERENCE_CONTENT"), true);
  assert.equal(mapped.intakeSources?.some((s) => s.role === "OWN_CONTENT"), true);
  assert.equal(mapped.intakeSources?.some((s) => s.role === "PRODUCTION_ASSET"), false);
  // Reference must not become fake market CONTENT fact by role alone without MARKET_EVIDENCE
  assert.equal(
    mapped.items.filter((i) => i.kind === "CONTENT" && String(i.externalUrl ?? "").includes("video/99")).length,
    0,
  );

  const ctx = buildMarketResearchContext({ sources: draft.sources, keywords: draft.keywords });
  assert.equal(ctx.evidenceSummaries.length, 1);
  assert.equal(ctx.referenceSeeds.length, 1);
  assert.equal(ctx.ownContentSeeds.length, 1);

  const empty = emptyMarketIntakeDraft();
  assert.equal(getMarketIntakeReadiness(empty).readyForConfirmation, false);
  const withUrl = mergeExtractedUrlSources(empty, "看看 https://www.douyin.com/video/1 这条");
  assert.equal(withUrl.added, 1);
  assert.equal(withUrl.draft.sources[0]?.sourceType, "DOUYIN_VIDEO_URL");

  assert.equal(marketSourceRoleLabel("REFERENCE_CONTENT"), "爆款参考");
  assert.equal(marketSourceTypeLabel("UPLOAD_SCREENSHOT"), "市场截图");
  assert.equal(marketSourceRoleLabel("MARKET_EVIDENCE").includes("MARKET_EVIDENCE"), false);

  const panel = readFileSync(join(here, "../components/intake/market-source-intake-panel.tsx"), "utf8");
  assert.equal(panel.includes("DOUYIN_VIDEO_URL"), false);
  assert.ok(panel.includes("爆款参考") || panel.includes("marketSourceRoleLabel"));
  assert.ok(panel.includes("让系统自己研究"));
  assert.ok(panel.includes("自动市场研究服务尚未配置"));
  assert.equal(panel.includes("supportCount"), false);
  assert.ok(panel.includes("已加入素材库"));

  console.log("market-source.selfcheck PASS");
}

run();
