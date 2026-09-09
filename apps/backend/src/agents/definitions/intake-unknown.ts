/**
 * Shared unknown-reply detector — do not persist as facts.
 */
const UNKNOWN_EXACT =
  /^(不知道|不清楚|不确定|不了解|没有|暂无|无|都不知道|什么都不知道|暂时没有|没什么|没关注|没有竞品|不清楚竞品|不知道有什么竞品|没有关注过竞品|竞品我不知道|不知道竞品|其他我也不知道|我也不知道)$/i;

const UNKNOWN_HEDGE =
  /^(我)?(也)?(都)?(其他)?(暂时|目前)?(什么都)?(不|没).{0,6}(知道|清楚|确定|了解|关注)|(竞品).{0,4}(不知道|不清楚|没关注)/;

export function isUnknownUserReply(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  if (UNKNOWN_EXACT.test(trimmed)) {
    return true;
  }
  if (trimmed.length <= 24 && UNKNOWN_HEDGE.test(trimmed)) {
    return true;
  }
  return false;
}

export function filterUnknownStrings(values: string[]): string[] {
  return values.filter((item) => typeof item === 'string' && !isUnknownUserReply(item));
}
