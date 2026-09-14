import assert from "node:assert/strict";
import {
  REFERENCE_INSUFFICIENT_HINT,
  REFERENCE_ORIGINALITY_DISCLAIMER,
  analysisStatusLabel,
  isInsufficientAnalysis,
  patternCardsFromAnalysis,
  patternTypeLabel,
} from "./reference-intelligence";

assert.equal(patternTypeLabel("HOOK"), "开头 Hook");
assert.equal(analysisStatusLabel("INSUFFICIENT"), "输入不足");
assert.equal(REFERENCE_ORIGINALITY_DISCLAIMER.includes("不直接复制"), true);
assert.equal(REFERENCE_INSUFFICIENT_HINT.includes("链接"), true);

assert.equal(
  isInsufficientAnalysis({
    id: "a",
    status: "INSUFFICIENT",
    version: 1,
    payload: { code: "ANALYSIS_INPUT_INSUFFICIENT" },
  }),
  true,
);

const cards = patternCardsFromAnalysis({
  id: "a",
  status: "COMPLETED",
  version: 1,
  payload: {
    hookPattern: "提问开场",
    narrativePattern: "痛点到方案",
    pacingPattern: "前段偏快",
    shotPattern: "口播+说明画面",
    subtitlePattern: "短句字幕",
    ctaPattern: "引导私信",
  },
});
assert.equal(cards.length, 6);
assert.equal(cards.some((c) => c.label === "HOOK"), false);
assert.equal(JSON.stringify(cards).includes("SHOT_STRUCTURE"), false);

console.log("reference-intelligence.selfcheck: ok");
