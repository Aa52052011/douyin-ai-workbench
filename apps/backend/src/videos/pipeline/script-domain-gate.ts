const WORKPLACE_MARKERS = /职场沟通|新人开口|会议表达|汇报清单/;
const LOCAL_OFFER_MARKERS = /咖啡|手冲|拿铁|到店|cafe|coffee/i;

export function flattenScriptCopy(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const row = payload as Record<string, unknown>;
  const sections = Array.isArray(row.sections) ? row.sections : [];
  const sectionText = sections
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }
      const section = item as Record<string, unknown>;
      return [section.narration, section.subtitle, section.visualSuggestion].filter((v) => typeof v === 'string').join('');
    })
    .join('');
  return [row.title, row.hook, row.opening, row.ending, row.cta, sectionText]
    .filter((v) => typeof v === 'string')
    .join('');
}

export function isScriptDomainMismatch(scriptPayload: unknown, projectContext: string): boolean {
  const script = flattenScriptCopy(scriptPayload);
  if (!script) {
    return false;
  }
  const projectIsLocalOffer = LOCAL_OFFER_MARKERS.test(projectContext);
  const scriptIsWorkplace = WORKPLACE_MARKERS.test(script);
  const scriptIsLocalOffer = LOCAL_OFFER_MARKERS.test(script);
  return projectIsLocalOffer && scriptIsWorkplace && !scriptIsLocalOffer;
}
