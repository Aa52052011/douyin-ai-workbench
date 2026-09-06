export const CONFIG_INVALID = 'CONFIG_INVALID';

export class RuntimeConfigError extends Error {
  readonly code = CONFIG_INVALID;
  readonly issues: string[];

  constructor(issues: string[]) {
    const unique = [...new Set(issues.filter(Boolean))];
    super(formatRuntimeConfigError(unique));
    this.name = 'RuntimeConfigError';
    this.issues = unique;
  }
}

export function formatRuntimeConfigError(issues: string[]): string {
  return `Configuration invalid:\n${issues.map((issue) => `- ${issue}`).join('\n')}`;
}
