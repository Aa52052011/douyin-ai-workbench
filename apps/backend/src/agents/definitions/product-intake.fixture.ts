import type { ProductIntakeAgentOutput, ProductIntakeDraft } from './product-intake.types.js';
import { getProductIntakeReadiness, mergeProductIntakeDraft } from './product-intake.patch.js';

/**
 * Deterministic mock for product.intake.
 * Parses structured sections from the rendered user prompt.
 */
export function buildMockProductIntakeOutput(prompt: string): ProductIntakeAgentOutput {
  const latest = extractSection(prompt, '最新用户消息：') || extractSection(prompt, '最新用户消息:');
  const draftJson =
    extractSection(prompt, '当前 Draft（紧凑 JSON）：') ||
    extractSection(prompt, '当前 Draft（JSON）：') ||
    extractSection(prompt, '当前 Draft(JSON)：');
  let currentDraft: ProductIntakeDraft = {};
  try {
    currentDraft = JSON.parse(draftJson || '{}') as ProductIntakeDraft;
  } catch {
    currentDraft = {};
  }
  const improving = /完善已有产品信息[：:]\s*true/i.test(prompt);
  const text = latest.trim();

  // Boundary: positioning request
  if (/账号定位|怎么定位|persona|content pillars|发布策略/.test(text)) {
    const readiness = getProductIntakeReadiness(currentDraft);
    return {
      message:
        '账号定位会在「账号定位」阶段生成。这一步我们先把产品事实收集完整。你更想先补充目标用户、业务目标，还是产品卖点？',
      draftPatch: {},
      suggestions: [],
      missingFields: readiness.missingFields,
      readyForConfirmation: readiness.readyForConfirmation,
    };
  }

  // Hallucination / sparse
  if (/^我有一个软件[.。!！]?$/.test(text.trim()) || text.trim() === '我有一个软件') {
    const readiness = getProductIntakeReadiness(currentDraft);
    return {
      message: '好的。这个软件主要解决什么问题？或者它具体叫什么名字？',
      draftPatch: {},
      suggestions: [],
      missingFields: readiness.missingFields,
      readyForConfirmation: false,
    };
  }

  // Keyword unknown → suggestions only
  if (/不知道关键词|没有关键词|不清楚关键词/.test(text)) {
    const readiness = getProductIntakeReadiness(currentDraft);
    return {
      message: '没关系。我可以根据现有产品信息给几个可选关键词，你确认后再写入。',
      draftPatch: {},
      suggestions: [
        {
          id: 'kw-1',
          field: 'seedKeywords',
          value: ['短视频获客', '本地生活'],
          label: '建议关键词',
        },
      ],
      missingFields: readiness.missingFields,
      readyForConfirmation: readiness.readyForConfirmation,
    };
  }

  // Correction — nail salon over beauty salon
  if (/不是美容院|是美甲店|改成美甲/.test(text)) {
    const patch: ProductIntakeDraft = { targetAudience: '美甲店老板' };
    if (/美甲店/.test(text)) {
      patch.targetAudience = /老板/.test(text) ? '美甲店老板' : '美甲店';
    }
    const nameMatch =
      text.match(/产品叫\s*[「"']?([^「」"'，。\s]{1,40})[」"']?/) ||
      text.match(/叫作?\s*[「"']?([^「」"'，。\s]{1,40})[」"']?/);
    if (nameMatch) {
      patch.productName = nameMatch[1];
    }
    if (/抖音获客|获得到店|到店咨询|获客/.test(text)) {
      patch.businessGoal = /到店咨询/.test(text)
        ? '通过抖音获得到店咨询'
        : '通过抖音获客';
    }
    if (/行业是\s*([^\s，。]{1,40})/.test(text)) {
      patch.industry = text.match(/行业是\s*([^\s，。]{1,40})/)![1];
    }
    const merged = mergeProductIntakeDraft(currentDraft, patch);
    const readiness = getProductIntakeReadiness(merged);
    return {
      message: readiness.readyForConfirmation
        ? `已把目标用户调整为${patch.targetAudience}。核心信息已基本完整，可以确认。`
        : `已把目标用户调整为${patch.targetAudience}。${nextMissingQuestion(readiness.missingFields)}`,
      draftPatch: patch,
      suggestions: [],
      missingFields: readiness.missingFields,
      readyForConfirmation: readiness.readyForConfirmation,
    };
  }

  // Correction — beauty salon
  if (/不是餐饮|改成美容院|主要是美容院|说错了/.test(text)) {
    const patch: ProductIntakeDraft = { targetAudience: '美容院' };
    if (/美容院/.test(text)) {
      patch.targetAudience = '美容院';
    }
    const nameMatch =
      text.match(/产品叫\s*[「"']?([^「」"'，。\s]{1,40})[」"']?/) ||
      text.match(/叫作?\s*[「"']?([^「」"'，。\s]{1,40})[」"']?/);
    if (nameMatch) {
      patch.productName = nameMatch[1];
    }
    if (/抖音获客|获得到店|到店咨询|获客/.test(text)) {
      patch.businessGoal = /到店咨询/.test(text)
        ? '通过抖音获得到店咨询'
        : '通过抖音获客';
    }
    if (/行业是\s*([^\s，。]{1,40})/.test(text)) {
      patch.industry = text.match(/行业是\s*([^\s，。]{1,40})/)![1];
    }
    const merged = mergeProductIntakeDraft(currentDraft, patch);
    const readiness = getProductIntakeReadiness(merged);
    return {
      message: readiness.readyForConfirmation
        ? '已把目标用户更正为美容院。核心信息已基本完整，可以确认；也可以继续补充卖点或关键词。'
        : '已更正目标用户为美容院。接下来最重要的是：你的业务目标是什么？',
      draftPatch: patch,
      suggestions: [],
      missingFields: readiness.missingFields,
      readyForConfirmation: readiness.readyForConfirmation,
    };
  }

  const patch: ProductIntakeDraft = {};

  // Named product patterns
  const nameMatch =
    text.match(/产品叫\s*[「"']?([^「」"'，。\s]{1,40})[」"']?/) ||
    text.match(/叫作?\s*[「"']?([^「」"'，。\s]{1,40})[」"']?/);
  if (nameMatch) {
    patch.productName = nameMatch[1];
  }

  if (/美容院/.test(text) && /客户|用户|服务|帮助|给|老板/.test(text)) {
    patch.targetAudience = /老板/.test(text) ? '美容院老板' : '美容院';
  } else if (/美甲店/.test(text) && /客户|用户|服务|帮助|给|老板/.test(text)) {
    patch.targetAudience = /老板/.test(text) ? '美甲店老板' : '美甲店';
  } else if (/餐饮/.test(text) && /客户|用户|商家/.test(text)) {
    patch.targetAudience = '餐饮店';
  } else if (/中小商家|本地商家/.test(text)) {
    // Do not auto-write unless clearly stated as audience — leave as suggestion opportunity
  }

  if (/抖音获客|获得到店|到店咨询|获客/.test(text)) {
    patch.businessGoal = /到店咨询/.test(text)
      ? '通过抖音获得到店咨询'
      : /获客/.test(text)
        ? '通过抖音获客'
        : patch.businessGoal;
  }

  if (/自动生成.*(短视频|视频)|不用自己剪辑|输入活动内容就自动生成/.test(text)) {
    patch.sellingPoints = ['输入活动内容即可自动生成视频，无需自行剪辑'];
    if (!patch.description && /工具|软件|助手|SaaS/.test(text)) {
      patch.description = text.slice(0, 200);
    }
  }

  if (
    /帮助.*自动生成抖音短视频|短视频的(?:AI )?工具|AI 工具|AI工具|抖音AI工具|抖音.?AI/.test(text) ||
    /商家自动生成/.test(text)
  ) {
    if (!patch.description) {
      patch.description = text.slice(0, 200);
    }
    if (/美容院/.test(text)) {
      patch.targetAudience = patch.targetAudience ?? (/老板/.test(text) ? '美容院老板' : '美容院');
      patch.industry = patch.industry ?? '美业';
    }
    if (/美甲店/.test(text)) {
      patch.targetAudience = patch.targetAudience ?? (/老板/.test(text) ? '美甲店老板' : '美甲店');
      patch.industry = patch.industry ?? '美业';
    }
    if (/没时间拍摄|没时间.*剪辑|拍摄和剪辑/.test(text)) {
      patch.painPoints = ['老板没时间拍摄和剪辑'];
    }
  }

  if (/美业|美容院/.test(text) && /SaaS|会员管理/.test(text)) {
    patch.description = patch.description ?? text.slice(0, 200);
    patch.targetAudience = patch.targetAudience ?? '美容院';
    patch.category = 'SaaS';
  }

  // Industry only if explicit
  if (/行业是\s*([^\s，。]{1,40})/.test(text)) {
    patch.industry = text.match(/行业是\s*([^\s，。]{1,40})/)![1];
  } else if (/美妆护肤|美业/.test(text) && /行业/.test(text)) {
    patch.industry = /美妆护肤/.test(text) ? '美妆护肤' : '美业';
  }

  const merged = mergeProductIntakeDraft(currentDraft, patch);
  const readiness = getProductIntakeReadiness(merged);

  let message: string;
  if (improving && Object.keys(patch).length === 0) {
    message = '我已经读取了你当前确认的产品信息。这次想先改哪一块？也可以继续补充卖点、关键词或限制。';
  } else if (readiness.readyForConfirmation) {
    message =
      '产品的核心信息已经基本完整，可以确认。如果你愿意，我还可以继续补充卖点、关键词或限制。';
  } else {
    message = nextMissingQuestion(readiness.missingFields);
  }

  return {
    message,
    draftPatch: patch,
    suggestions: [],
    missingFields: readiness.missingFields,
    readyForConfirmation: readiness.readyForConfirmation,
  };
}

export function buildMockProductIntakeText(prompt: string): string {
  return JSON.stringify(buildMockProductIntakeOutput(prompt));
}

function nextMissingQuestion(missing: string[]): string {
  const ask = missing.slice(0, 2);
  if (ask.includes('productName') && ask.includes('businessGoal')) {
    return '这个产品叫什么名字？你最希望通过抖音带来什么结果？';
  }
  if (ask.includes('productName') && ask.includes('industry')) {
    return '这个产品叫什么？主要属于哪个行业？';
  }
  if (ask.includes('targetAudience') && ask.includes('businessGoal')) {
    return '这个产品主要服务哪类人？你最希望通过抖音带来什么结果？';
  }
  if (ask[0] === 'productName') return '这个产品或服务有具体名称吗？';
  if (ask[0] === 'industry') return '它主要属于哪个行业？';
  if (ask[0] === 'businessGoal') return '你最希望通过推广达成什么业务目标？';
  if (ask[0] === 'targetAudience') return '主要希望服务哪类用户或商家？';
  if (ask[0] === 'description') return '能否用一两句话介绍它解决什么问题，或列出核心卖点？';
  return '还有哪一点你希望补充到产品信息里？';
}

function extractSection(prompt: string, marker: string): string {
  const idx = prompt.indexOf(marker);
  if (idx < 0) {
    return '';
  }
  const rest = prompt.slice(idx + marker.length).trim();
  const nextMarkers = ['当前 Draft', '最近对话', '最新用户消息', '请输出'];
  let end = rest.length;
  for (const m of nextMarkers) {
    if (m === marker.replace(/[：:]/g, '')) continue;
    const at = rest.indexOf(m);
    if (at >= 0) {
      end = Math.min(end, at);
    }
  }
  return rest.slice(0, end).trim();
}
