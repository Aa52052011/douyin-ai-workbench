/**
 * Frozen B2-6C3 historical snapshot of visual.semantic.ui-structure:v1 model-output rules.
 * Not used at runtime. Do not treat as the live prompt.
 */
export const UI_STRUCTURE_PROMPT_MODULE_V1 = 'visual.semantic.ui-structure:v1' as const;

export const UI_STRUCTURE_MODEL_OUTPUT_RULES_V1 = `Return exactly one JSON object with this envelope:
{"observations":[...]}

Each observation object may only use keys: type, confidence, visualSignals, uncertainty, frameId, region, text.
Required per observation: type, confidence, visualSignals (non-empty string array), uncertainty, frameId.
uncertainty is required for every observation: {level, reasons}.
level must be one of: LOW, MEDIUM, HIGH.
reasons must be a string array describing visual uncertainty, not a restatement of confidence.
confidence and uncertainty are independent. Do not set level from 1-confidence.
frameId is required and must be copied from the FRAME_ID label of the image the observation comes from.
Do not guess frameId from observation order.
Optional: region {x,y,width,height} normalized 0-1 inclusive bounds (x+width<=1, y+height<=1). Omit region if unsure. Do not clamp.
Optional: text (visible label transcription). Omit if none.

Allowed type values only:
PRODUCT_UI
BROWSER_CHROME
OS_CHROME
APP_WINDOW_CHROME
TOOLBAR
NAVIGATION
CONTENT_PANEL
TEXT_REGION
BUTTON_LIKE_REGION
FORM_REGION
DIALOG
MODAL
CARD
TABLE
CHART
CODE_BLOCK
SCREEN
DOCUMENT
BRAND_ELEMENT
UNKNOWN_STRUCTURED_REGION
DEVELOPER_ARTIFACT
LOCALHOST_REFERENCE
TERMINAL

Do not invent new type names.
PRODUCT_UI means the visible application/product interface as a whole or a major application surface, not merely one child control.
If a frame visibly shows the product application UI, emit PRODUCT_UI in addition to child regions when supported.
Whole-surface and child observations may coexist. Region containment is not a conflict.
Do not emit PRODUCT_UI if the frame only shows browser chrome, OS chrome, a document, or unrelated visual content.
Product navigation and browser chrome must be separate observations when both are visible.
Do not infer browser chrome from top position alone.
BROWSER_CHROME only if address bar, tabs, or browser controls are actually visible.
Do not label a product application header as BROWSER_CHROME.
APP_WINDOW_CHROME is a native window frame, not product navigation.
confidence must be a number from 0 to 1, not 0-100 and not a string.
Do not output providerId, providerFamily, requestId, source, observationId, schemaVersion, evidence, semanticRegions, warnings, moduleResults, or occurrenceRatio.`;
