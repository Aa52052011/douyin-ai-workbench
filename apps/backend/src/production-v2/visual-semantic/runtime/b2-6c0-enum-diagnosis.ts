import { VISUAL_SEMANTIC_OBSERVATION_TYPES } from '../contracts/observation.types.js';
import { MODEL_OUTPUT_OBSERVATION_TYPES } from './model-output.types.js';
import { buildUiStructureUserPrompt } from './ui-structure-prompt.js';

export const B2_6B_SCHEMA_FAIL_PATH = 'model-output:observations[15].type:enum';
export const B2_6C0_INVALID_INDEX = 15;

const PRODUCT_UI_SYNONYM_CANDIDATES = [
  'PRODUCT_INTERFACE',
  'APPLICATION_UI',
  'APP_UI',
  'WEB_APP',
  'APPLICATION',
] as const;

export function extractPromptObservationTypes(prompt: string): string[] {
  const startToken = 'Allowed type values only:';
  const endToken = 'Do not invent new type names.';
  const start = prompt.indexOf(startToken);
  if (start < 0) {
    return [];
  }
  const end = prompt.indexOf(endToken, start + startToken.length);
  if (end < 0 || end <= start) {
    return [];
  }
  return prompt
    .slice(start + startToken.length, end)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[A-Z][A-Z0-9_]+$/.test(line));
}

export function diffStringSets(left: readonly string[], right: readonly string[]): {
  onlyLeft: string[];
  onlyRight: string[];
} {
  const a = new Set(left);
  const b = new Set(right);
  return {
    onlyLeft: [...a].filter((item) => !b.has(item)).sort(),
    onlyRight: [...b].filter((item) => !a.has(item)).sort(),
  };
}

export function assessExactEnumInstruction(prompt: string): 'STRONG' | 'PARTIAL' | 'MISSING' {
  const hasList = /Allowed type values only:/i.test(prompt) && extractPromptObservationTypes(prompt).length > 0;
  const noInvent = /Do not invent new type names/i.test(prompt);
  const noSynonym = /do not use synonyms/i.test(prompt);
  const exactLiteral =
    /exactly as written|only enum literals|exact observation type enum literals|case-sensitive exact literals/i.test(
      prompt,
    );
  if (!hasList && !noInvent) return 'MISSING';
  if (hasList && noInvent && noSynonym && exactLiteral) return 'STRONG';
  if (hasList && noInvent) return 'PARTIAL';
  return 'MISSING';
}

export function promptListsType(prompt: string, type: string): boolean {
  return extractPromptObservationTypes(prompt).includes(type);
}

export function buildEnumContractDiagnosis(input: {
  recoveredType: string | null;
  evidenceNotes: string[];
}): {
  promptTypes: string[];
  modelDtoTypes: readonly string[];
  b21Types: readonly string[];
  promptVsDto: { onlyPrompt: string[]; onlyDto: string[] };
  dtoVsB21: { onlyDto: string[]; onlyB21: string[] };
  promptEnumDrift: 'YES' | 'NO';
  modelDtoInternalDrift: 'YES' | 'NO';
  exactEnumInstruction: 'STRONG' | 'PARTIAL' | 'MISSING';
  enumSourceDuplication: 'YES' | 'NO';
  productUiSynonymsInPromptEnum: string[];
  productUiDefinitionPresent: boolean;
  promptAllowsInvalid: 'YES' | 'NO' | 'UNKNOWN';
  dtoAllowsInvalid: 'YES' | 'NO' | 'UNKNOWN';
  b21AllowsInvalid: 'YES' | 'NO' | 'UNKNOWN';
  failureClassification:
    | 'PROMPT_ENUM_DRIFT'
    | 'MODEL_ENUM_NONCOMPLIANCE'
    | 'MODEL_DTO_ENUM_GAP'
    | 'MULTIPLE'
    | 'UNKNOWN_INSUFFICIENT_EVIDENCE';
} {
  const prompt = buildUiStructureUserPrompt(['semantic-frame:0', 'semantic-frame:1', 'semantic-frame:2']);
  const promptTypes = extractPromptObservationTypes(prompt);
  const modelDtoTypes = MODEL_OUTPUT_OBSERVATION_TYPES;
  const b21Types = VISUAL_SEMANTIC_OBSERVATION_TYPES;
  const promptVsDtoRaw = diffStringSets(promptTypes, modelDtoTypes);
  const dtoVsB21Raw = diffStringSets(modelDtoTypes, b21Types);
  const recovered = input.recoveredType;
  const promptAllowsInvalid = recovered ? (promptListsType(prompt, recovered) ? 'YES' : 'NO') : 'UNKNOWN';
  const dtoAllowsInvalid = recovered
    ? (modelDtoTypes as readonly string[]).includes(recovered)
      ? 'YES'
      : 'NO'
    : 'NO';
  const b21AllowsInvalid = recovered ? ((b21Types as readonly string[]).includes(recovered) ? 'YES' : 'NO') : 'UNKNOWN';

  let failureClassification:
    | 'PROMPT_ENUM_DRIFT'
    | 'MODEL_ENUM_NONCOMPLIANCE'
    | 'MODEL_DTO_ENUM_GAP'
    | 'MULTIPLE'
    | 'UNKNOWN_INSUFFICIENT_EVIDENCE' = 'UNKNOWN_INSUFFICIENT_EVIDENCE';

  if (recovered) {
    const promptYes = promptAllowsInvalid === 'YES';
    const dtoYes = dtoAllowsInvalid === 'YES';
    const b21Yes = b21AllowsInvalid === 'YES';
    if (promptYes && !dtoYes) failureClassification = 'PROMPT_ENUM_DRIFT';
    else if (!promptYes && !dtoYes && !b21Yes) failureClassification = 'MODEL_ENUM_NONCOMPLIANCE';
    else if (!promptYes && !dtoYes && b21Yes) failureClassification = 'MODEL_DTO_ENUM_GAP';
    else failureClassification = 'MULTIPLE';
  }

  return {
    promptTypes,
    modelDtoTypes,
    b21Types,
    promptVsDto: { onlyPrompt: promptVsDtoRaw.onlyLeft, onlyDto: promptVsDtoRaw.onlyRight },
    dtoVsB21: { onlyDto: dtoVsB21Raw.onlyLeft, onlyB21: dtoVsB21Raw.onlyRight },
    promptEnumDrift: promptVsDtoRaw.onlyLeft.length > 0 || promptVsDtoRaw.onlyRight.length > 0 ? 'YES' : 'NO',
    modelDtoInternalDrift: dtoVsB21Raw.onlyLeft.length > 0 ? 'YES' : 'NO',
    exactEnumInstruction: assessExactEnumInstruction(prompt),
    enumSourceDuplication:
      promptVsDtoRaw.onlyLeft.length === 0 && promptVsDtoRaw.onlyRight.length === 0 ? 'NO' : 'YES',
    productUiSynonymsInPromptEnum: PRODUCT_UI_SYNONYM_CANDIDATES.filter((item) => promptListsType(prompt, item)),
    productUiDefinitionPresent: /PRODUCT_UI means the visible application\/product interface/i.test(prompt),
    promptAllowsInvalid,
    dtoAllowsInvalid,
    b21AllowsInvalid,
    failureClassification,
  };
}

export { PRODUCT_UI_SYNONYM_CANDIDATES };
