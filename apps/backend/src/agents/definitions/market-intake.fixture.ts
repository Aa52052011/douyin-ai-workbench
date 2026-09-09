import type { MarketIntakeAgentOutput, MarketIntakeDraft } from './market-intake.types.js';
import { getMarketIntakeReadinessFromDraft, mergeMarketIntakeDraft } from './market-intake.patch.js';

/**
 * Deterministic mock for market.intake.
 * Parses structured sections from the rendered user prompt.
 */
export function buildMockMarketIntakeOutput(prompt: string): MarketIntakeAgentOutput {
  const latest = extractSection(prompt, '最新用户消息：') || extractSection(prompt, '最新用户消息:');
  const draftJson =
    extractSection(prompt, '当前 Market Draft（紧凑 JSON）：') ||
    extractSection(prompt, '当前 Market Draft（JSON）：') ||
    extractSection(prompt, '当前 Market Draft(JSON)：') ||
    extractSection(prompt, '当前 Draft（紧凑 JSON）：') ||
    extractSection(prompt, '当前 Draft（JSON）：');
  let currentDraft: MarketIntakeDraft = {};
  try {
    currentDraft = JSON.parse(draftJson || '{}') as MarketIntakeDraft;
  } catch {
    currentDraft = {};
  }
  const improving = /完善已有市场调研[：:]\s*true/i.test(prompt);
  const briefJson =
    extractSection(prompt, '已确认产品信息（上下文，不是市场事实）：') ||
    extractSection(prompt, '已确认产品信息');
  let productName = '';
  let targetAudience = '';
  try {
    const brief = JSON.parse(briefJson || '{}') as { productName?: string; targetAudience?: string };
    productName = brief.productName ?? '';
    targetAudience = brief.targetAudience ?? '';
  } catch {
    /* ignore */
  }
  const text = latest.trim();

  // Boundary / hallucination
  if (/最火|市场规模|增长率|爆款播放量|当前抖音最热|告诉我这个市场现在/.test(text)) {
    const readiness = getMarketIntakeReadinessFromDraft(currentDraft);
    return {
      message:
        '这一阶段我先帮你收集研究方向和素材，正式市场判断会在下一步市场分析中完成。根据你的产品信息，你更想先确定关键词方向，还是补充竞品/公开视频线索？',
      draftPatch: {},
      suggestions: buildKeywordSuggestions(productName, targetAudience),
      missingAreas: readiness.missingAreas,
      readyForConfirmation: readiness.readyForConfirmation,
    };
  }

  // No-data / unknown — never fabricate facts
  if (/什么都不知道|我什么都没有|暂时没有.*数据|不知道研究什么|没有市场数据|其他我也不知道|我也不知道|都不知道/.test(text)) {
    const readiness = getMarketIntakeReadinessFromDraft(currentDraft);
    const hasKw = Boolean(currentDraft.keywords?.length);
    return {
      message: readiness.itemCount > 0
        ? '没关系，已有素材可以先确认这一轮；后续再补也行。'
        : hasKw
          ? '没关系，可以先按低数据模式继续，后续再补。'
          : '没关系，可以先按低数据模式继续。你也可以点击「我暂时没有市场数据」直接进入确认。',
      draftPatch: {},
      suggestions: readiness.itemCount > 0 ? [] : buildKeywordSuggestions(productName, targetAudience),
      missingAreas: readiness.missingAreas,
      readyForConfirmation: readiness.readyForConfirmation,
    };
  }

  // No competitor fabrication
  if (/不知道有什么竞品|没有关注过竞品|没有竞品|不清楚竞品|竞品我不知道|不知道竞品/.test(text)) {
    const readiness = getMarketIntakeReadinessFromDraft(currentDraft);
    const alreadyHasKeywords = Boolean(currentDraft.keywords?.length);
    return {
      message: alreadyHasKeywords
        ? '没关系，竞品可以以后再补。当前关键词方向已经够用，也可以确认这轮调研。'
        : '没关系，这一步不需要竞品后台数据。你有没有看过相关公开视频，或者客户常问什么问题？也可以稍后再补充竞品。',
      draftPatch: {},
      suggestions: [],
      missingAreas: readiness.missingAreas,
      readyForConfirmation: readiness.readyForConfirmation,
    };
  }

  // Vague competitor type — ask, don't invent
  if (/类似.*那种账号|像蝉妈妈那种/.test(text) && !/叫|名叫|账号是|链接/.test(text)) {
    const readiness = getMarketIntakeReadinessFromDraft(currentDraft);
    return {
      message: '你记得具体账号名称或主页链接吗？有的话我可以记下来；没有也可以先跳过竞品。',
      draftPatch: {},
      suggestions: [],
      missingAreas: readiness.missingAreas,
      readyForConfirmation: readiness.readyForConfirmation,
    };
  }

  // Correction
  if (/名字错了|写错了|不是.+是|改成|刚才.*错/.test(text)) {
    const nameMatch =
      text.match(/是\s*[「"']?([^「」"'，。\s]{2,40})[」"']?/) ||
      text.match(/改成\s*[「"']?([^「」"'，。\s]{2,40})[」"']?/) ||
      text.match(/叫\s*[「"']?([^「」"'，。\s]{2,40})[」"']?/);
    if (nameMatch) {
      const patch: MarketIntakeDraft = {
        competitorAccounts: [{ displayName: nameMatch[1] }],
      };
      const merged = mergeMarketIntakeDraft(currentDraft, patch);
      const readiness = getMarketIntakeReadinessFromDraft(merged);
      return {
        message: `已更正竞品账号为「${nameMatch[1]}」。还想补充公开视频链接，还是你的市场观察？`,
        draftPatch: patch,
        suggestions: [],
        missingAreas: readiness.missingAreas,
        readyForConfirmation: readiness.readyForConfirmation,
      };
    }
  }

  const patch: MarketIntakeDraft = {};

  // Explicit competitor
  const competitorMatch =
    text.match(/竞品叫\s*[「"']?([^「」"'，。\s]{2,40})[」"']?/) ||
    text.match(/关注过(?:一个)?叫\s*[「"']?([^「」"'，。\s]{2,40})[」"']?/) ||
    text.match(/账号[叫是]\s*[「"']?([^「」"'，。\s]{2,40})[」"']?/);
  if (competitorMatch) {
    patch.competitorAccounts = [{ displayName: competitorMatch[1] }];
  }

  // URL
  const urlMatch = text.match(/https?:\/\/[^\s，。]+/i);
  if (urlMatch) {
    const url = urlMatch[0];
    if (/video|douyin|抖音/.test(text + url)) {
      patch.competitorVideos = [{ url, label: '公开视频链接（尚未自动抓取）' }];
    } else {
      patch.publicLinks = [{ url, label: '公开链接（尚未自动抓取）' }];
    }
  }

  // Keywords — user-stated directions
  const keywordHits: string[] = [];
  for (const candidate of [
    '美甲店获客',
    '美甲店短视频',
    '到店咨询',
    '美业营销',
    '短视频获客',
  ]) {
    if (text.includes(candidate)) keywordHits.push(candidate);
  }
  // 「美甲店获客和短视频」→ also capture 美甲店短视频
  if (/美甲店/.test(text) && /短视频/.test(text) && !keywordHits.includes('美甲店短视频')) {
    keywordHits.push('美甲店短视频');
  }
  if (/美甲店/.test(text) && /获客/.test(text) && !keywordHits.includes('美甲店获客')) {
    keywordHits.push('美甲店获客');
  }
  const quoted = [...text.matchAll(/[「"']([^「」"']{2,30})[」"']/g)].map((m) => m[1]);
  for (const q of quoted) {
    if (!keywordHits.includes(q)) keywordHits.push(q);
  }
  if (/想(?:先)?看看|想研究|研究方向|研究/.test(text) && keywordHits.length) {
    patch.keywords = keywordHits;
  } else if (keywordHits.length >= 2 && /和|、|,/.test(text)) {
    patch.keywords = keywordHits;
  }

  // Observations / questions / pain
  if (/我觉得|我感觉|客户最关心|观察到/.test(text)) {
    if (/价格/.test(text)) {
      patch.userObservations = [text.slice(0, 200)];
      if (/客户/.test(text)) {
        patch.commonPainPoints = ['价格敏感'];
      }
    } else if (/到店客流|客流/.test(text)) {
      patch.marketHypotheses = ['美甲店经营者可能更关注到店客流'];
      patch.userObservations = [text.slice(0, 200)];
    } else {
      patch.userObservations = [text.slice(0, 200)];
    }
  }

  const merged = mergeMarketIntakeDraft(currentDraft, patch);
  const readiness = getMarketIntakeReadinessFromDraft(merged);
  const alreadyHadKeywords = Boolean(currentDraft.keywords?.length);

  let message: string;
  if (improving && Object.keys(patch).length === 0) {
    message = '这次你想补充哪一类新信息？关键词、竞品、公开视频，还是你最近观察到的变化？';
  } else if (urlMatch && Object.keys(patch).length) {
    message = '已记录这个链接，当前尚未自动抓取内容。你还想补充关键词、竞品，还是客户常问的问题？';
  } else if (patch.keywords?.length) {
    message = alreadyHadKeywords
      ? '已更新关键词方向。还有没有你特别想关注的竞品或用户问题？'
      : '已记下这些研究方向。你有关注过的竞品账号或公开视频吗？没有也可以说「暂时没有」。';
  } else if (patch.competitorAccounts?.length) {
    message = '已记下竞品账号线索。还想补充公开视频链接，还是你的市场观察？';
  } else if (readiness.itemCount > 0) {
    message = alreadyHadKeywords
      ? '素材已更新。还有没有你特别想关注的竞品或用户问题？也可以直接确认这轮调研。'
      : '素材已更新。还想继续补充哪一类信息，还是可以确认这轮调研？';
  } else {
    message =
      '你现在知道哪些同行账号、关键词或用户常问的问题？暂时没有也可以说「暂时没有」。';
  }

  return {
    message,
    draftPatch: patch,
    suggestions: [],
    missingAreas: readiness.missingAreas,
    readyForConfirmation: readiness.readyForConfirmation,
  };
}

export function buildMockMarketIntakeText(prompt: string): string {
  return JSON.stringify(buildMockMarketIntakeOutput(prompt));
}

function buildKeywordSuggestions(productName: string, targetAudience: string): MarketIntakeAgentOutput['suggestions'] {
  const values = ['美甲店获客', '美甲店短视频', '到店咨询'];
  if (/美容|美甲/.test(targetAudience + productName)) {
    values.push('美业营销');
  }
  return [
    {
      id: 'kw-dir-1',
      field: 'keywords',
      value: values.slice(0, 3),
      label: '建议研究方向关键词',
      rationale: '根据产品信息提出的研究方向建议，不是已验证市场趋势',
    },
  ];
}

function extractSection(prompt: string, marker: string): string {
  const idx = prompt.indexOf(marker);
  if (idx < 0) return '';
  const rest = prompt.slice(idx + marker.length).trim();
  const nextMarkers = [
    '当前 Market Draft',
    '当前 Draft',
    '最近对话',
    '最新用户消息',
    '已确认产品信息',
    '请输出',
  ];
  let end = rest.length;
  for (const m of nextMarkers) {
    if (marker.startsWith(m)) continue;
    const at = rest.indexOf(m);
    if (at >= 0) end = Math.min(end, at);
  }
  return rest.slice(0, end).trim();
}
