import { CONTENT_01_NEW_ASSET_ID, CONTENT_01_OLD_ASSET_ID } from '../../visual-semantic/runtime/b2-6-guards.js';
import type { HumanFact, ProjectContextEvaluationInput, TruthConstraints, VisualSemanticSummary } from '../context.types.js';

export const CONTENT_01_PROJECT_ID = '01a08b3f-9638-7fd1-a1ee-344682fb4809';
export const CONTENT_01_TOPIC_ID = 'a00b1fd3-0427-4dfe-a557-1f8d294a88d1';
export const CONTENT_01_SCRIPT_ID = '01a08c1d-46ce-7951-82ed-2eddd2394faa';

export const IMAGE_PRODUCT_INFO = 'b10d7b09-6dc8-41a4-b786-83077e53be73';
export const IMAGE_PRODUCTION_CENTER = 'fa97c6ec-cb00-4902-b9ed-b4bc3949f8fe';
export const IMAGE_PUBLISH_OPS = 'b531a1b5-795c-44c1-b4d8-23ff96f6f4e3';
export const IMAGE_OLD_HOME = '6052c047-e5b6-4820-96be-7a73d8da5188';

export const CONTENT_01_TRUTH_CONSTRAINTS: TruthConstraints = {
  mustUseRealProductEvidence: true,
  mustNotRepresentMockAsReal: true,
  mustNotClaimUnvalidatedAutomaticPublishing: true,
  mustNotImplyGuaranteedGrowth: true,
};

const project = {
  projectId: CONTENT_01_PROJECT_ID,
  projectName: '抖音AI智能工作台｜真实Dogfood',
  productName: '抖音AI智能工作台',
  campaignObjective: '用真实系统 UI 解释产品是什么',
  contentPillar: '真实 Dogfood / 系统介绍',
};

const content = {
  topicId: CONTENT_01_TOPIC_ID,
  title: '先不看成片：抖音AI智能工作台到底是什么？',
};

const script = {
  scriptId: CONTENT_01_SCRIPT_ID,
  hook: '解释抖音AI智能工作台到底是什么，并展示系统实际承担哪些内容生产环节',
};

function baseInput(
  asset: ProjectContextEvaluationInput['assetFacts'],
  visual: VisualSemanticSummary,
  humanFacts: HumanFact[],
  overrides: ProjectContextEvaluationInput['overrides'] = [],
): ProjectContextEvaluationInput {
  return {
    projectContext: project,
    contentContext: content,
    scriptContext: script,
    assetFacts: asset,
    visualSemanticSummary: visual,
    humanFacts,
    overrides,
    truthConstraints: CONTENT_01_TRUTH_CONSTRAINTS,
  };
}

const CLEAN_VISION: VisualSemanticSummary = {
  observationTypes: ['PRODUCT_UI', 'NAVIGATION', 'CONTENT_PANEL', 'BROWSER_CHROME', 'BUTTON_LIKE_REGION', 'TEXT_REGION'],
  productUiObserved: true,
  navigationObserved: true,
  contentPanelObserved: true,
  browserChromeObserved: true,
  localhostObserved: false,
  emptyStateObserved: false,
  publishOperationsPageObserved: false,
};

export function content01CleanRecordingInput(): ProjectContextEvaluationInput {
  return baseInput(
    {
      assetId: CONTENT_01_NEW_ASSET_ID,
      mediaKind: 'VIDEO',
      width: 1920,
      height: 1040,
      durationMs: 35107,
    },
    CLEAN_VISION,
    [
      { code: 'CURRENT_RECORDING', sourceType: 'HUMAN_CONFIRMED', summary: 'current project recording of current system UI' },
      { code: 'NO_KNOWN_OLD_MOCK', sourceType: 'HUMAN_CONFIRMED', summary: 'no known old mock contamination' },
      { code: 'BROWSER_CHROME_PRESENT', sourceType: 'HUMAN_CONFIRMED', summary: 'browser chrome clearly present' },
      { code: 'CURRENT_PRODUCT_UI', sourceType: 'DETERMINISTIC_FACT', summary: '1920x1040 duration~35107ms' },
    ],
    [
      { kind: 'CONFIRM_CURRENT' },
      { kind: 'CONFIRM_NO_KNOWN_OLD_MOCK_CONTAMINATION' },
    ],
  );
}

export function content01OldContaminatedInput(): ProjectContextEvaluationInput {
  return baseInput(
    { assetId: CONTENT_01_OLD_ASSET_ID, mediaKind: 'VIDEO' },
    {
      observationTypes: ['PRODUCT_UI', 'TEXT_REGION', 'DEVELOPER_ARTIFACT', 'LOCALHOST_REFERENCE'],
      productUiObserved: true,
      navigationObserved: false,
      contentPanelObserved: false,
      browserChromeObserved: true,
      localhostObserved: true,
      emptyStateObserved: false,
      publishOperationsPageObserved: false,
    },
    [
      { code: 'STALE_HUMAN_CONFIRMED', sourceType: 'HUMAN_CONFIRMED', summary: 'old mock / stale content planning UI' },
      {
        code: 'MOCK_CONTAMINATION_HUMAN_CONFIRMED',
        sourceType: 'HUMAN_CONFIRMED',
        summary: 'human-confirmed stale mock: 本批职场成长内容规划 / 认知纠偏; incompatible with Content #1 truthful product evidence',
      },
    ],
    [{ kind: 'CONFIRM_STALE' }, { kind: 'CONFIRM_MOCK_CONTAMINATION' }],
  );
}

export function content01ProductInfoImageInput(): ProjectContextEvaluationInput {
  return baseInput(
    { assetId: IMAGE_PRODUCT_INFO, mediaKind: 'IMAGE' },
    {
      observationTypes: ['PRODUCT_UI', 'TEXT_REGION'],
      productUiObserved: true,
      navigationObserved: false,
      contentPanelObserved: true,
      browserChromeObserved: false,
      localhostObserved: false,
      emptyStateObserved: false,
      publishOperationsPageObserved: false,
    },
    [
      { code: 'CURRENT_RECORDING', sourceType: 'HUMAN_EXPECTED', summary: 'product-info AI conversation screenshot' },
      { code: 'PRODUCT_INFO_CONVERSATION', sourceType: 'HUMAN_CONFIRMED', summary: '产品信息 AI conversation' },
    ],
    [{ kind: 'CONFIRM_CURRENT' }],
  );
}

export function content01ProductionCenterImageInput(): ProjectContextEvaluationInput {
  return baseInput(
    { assetId: IMAGE_PRODUCTION_CENTER, mediaKind: 'IMAGE' },
    {
      observationTypes: ['PRODUCT_UI', 'CONTENT_PANEL'],
      productUiObserved: true,
      navigationObserved: false,
      contentPanelObserved: true,
      browserChromeObserved: false,
      localhostObserved: false,
      emptyStateObserved: true,
      publishOperationsPageObserved: false,
    },
    [
      { code: 'CURRENT_RECORDING', sourceType: 'HUMAN_EXPECTED', summary: '制作中心 empty state' },
      { code: 'EMPTY_STATE_LIMITATION', sourceType: 'HUMAN_CONFIRMED', summary: 'production center empty; cannot prove full workflow' },
    ],
    [{ kind: 'CONFIRM_CURRENT' }],
  );
}

export function content01PublishOpsImageInput(): ProjectContextEvaluationInput {
  return baseInput(
    { assetId: IMAGE_PUBLISH_OPS, mediaKind: 'IMAGE' },
    {
      observationTypes: ['PRODUCT_UI', 'BUTTON_LIKE_REGION', 'TEXT_REGION'],
      productUiObserved: true,
      navigationObserved: false,
      contentPanelObserved: true,
      browserChromeObserved: false,
      localhostObserved: false,
      emptyStateObserved: true,
      publishOperationsPageObserved: true,
    },
    [
      { code: 'CURRENT_RECORDING', sourceType: 'HUMAN_EXPECTED', summary: '发布运营 empty page' },
      { code: 'PUBLISH_OPS_PAGE', sourceType: 'HUMAN_CONFIRMED', summary: '发布运营 / 一键发布 visible' },
      {
        code: 'CLAIM_NOT_VALIDATED',
        sourceType: 'HUMAN_CONFIRMED',
        summary: '一键发布 is not formally validated as automatic unattended publishing',
      },
    ],
    [{ kind: 'CONFIRM_CURRENT' }],
  );
}

export function content01OldHomeImageInput(): ProjectContextEvaluationInput {
  return baseInput(
    { assetId: IMAGE_OLD_HOME, mediaKind: 'IMAGE' },
    {
      observationTypes: ['PRODUCT_UI'],
      productUiObserved: true,
      navigationObserved: false,
      contentPanelObserved: false,
      browserChromeObserved: false,
      localhostObserved: false,
      emptyStateObserved: true,
      publishOperationsPageObserved: false,
    },
    [
      { code: 'CURRENT_RECORDING', sourceType: 'HUMAN_EXPECTED', summary: 'known old empty-home candidate' },
      { code: 'OLD_EMPTY_HOME_LIMITATION', sourceType: 'HUMAN_CONFIRMED', summary: 'old empty home; LIMITED expectation' },
      { code: 'EMPTY_STATE_LIMITATION', sourceType: 'HUMAN_CONFIRMED', summary: 'empty home cannot prove workflow' },
    ],
    [{ kind: 'CONFIRM_CURRENT' }],
  );
}

export function chromeOnlyInput(): ProjectContextEvaluationInput {
  const base = content01CleanRecordingInput();
  return {
    ...base,
    visualSemanticSummary: {
      observationTypes: ['BROWSER_CHROME'],
      productUiObserved: false,
      navigationObserved: false,
      contentPanelObserved: false,
      browserChromeObserved: true,
      localhostObserved: false,
      emptyStateObserved: false,
      publishOperationsPageObserved: false,
    },
    humanFacts: base.humanFacts.filter((fact) => fact.code !== 'CURRENT_PRODUCT_UI'),
  };
}

export function localhostOnlyOnCurrentInput(): ProjectContextEvaluationInput {
  const base = content01CleanRecordingInput();
  return {
    ...base,
    visualSemanticSummary: {
      ...base.visualSemanticSummary,
      localhostObserved: true,
      observationTypes: [...base.visualSemanticSummary.observationTypes, 'LOCALHOST_REFERENCE'],
    },
    humanFacts: [...base.humanFacts, { code: 'LOCALHOST_PRESENT', sourceType: 'VISION_OBSERVATION', summary: 'localhost visible' }],
  };
}

export const CONTENT_01_CONTEXT_FIXTURE_META = {
  project,
  content,
  script,
  truthConstraints: CONTENT_01_TRUTH_CONSTRAINTS,
};
