export type PromptTemplate = {
  name: string;
  version: string;
  systemPrompt: string;
  userPromptTemplate: string;
};

export type RenderedPrompt = {
  name: string;
  version: string;
  systemPrompt: string;
  userPrompt: string;
};
