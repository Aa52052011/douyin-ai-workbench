export const GOLDEN_MODEL_OUTPUT_V1 = {
  observations: [
    {
      type: 'PRODUCT_UI' as const,
      confidence: 0.92,
      visualSignals: ['full product workspace'],
      frameId: 'synthetic-ui-0',
      uncertainty: { level: 'LOW' as const, reasons: ['full-frame product layout is unambiguous'] },
      region: { x: 0, y: 0, width: 1, height: 1 },
    },
    {
      type: 'NAVIGATION' as const,
      confidence: 0.88,
      visualSignals: ['top product navigation bar'],
      frameId: 'synthetic-ui-0',
      uncertainty: { level: 'MEDIUM' as const, reasons: ['header vs chrome distinction needs care'] },
      region: { x: 0, y: 0, width: 1, height: 0.1 },
    },
    {
      type: 'CONTENT_PANEL' as const,
      confidence: 0.9,
      visualSignals: ['main white content panel'],
      frameId: 'synthetic-ui-0',
      uncertainty: { level: 'LOW' as const, reasons: ['large inner panel is clearly content'] },
      region: { x: 0.18, y: 0.13, width: 0.79, height: 0.82 },
    },
    {
      type: 'BUTTON_LIKE_REGION' as const,
      confidence: 0.84,
      visualSignals: ['primary action button'],
      frameId: 'synthetic-ui-0',
      uncertainty: { level: 'HIGH' as const, reasons: ['button vs chip could be confused at this scale'] },
      region: { x: 0.2, y: 0.78, width: 0.14, height: 0.07 },
      text: 'START',
    },
  ],
};
