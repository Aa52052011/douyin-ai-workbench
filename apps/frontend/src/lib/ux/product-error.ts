export type ProductErrorV1 = {
  title: string;
  humanMessage: string;
  recoveryAction: string;
  technicalDetails?: string;
};

const RAW_PATTERNS = [/ECONNREFUSED/i, /Prisma/i, /stack:/i, /at Object\./, /ENOENT/, /TypeError:/, /AxiosError/];

export function looksLikeRawTechnicalError(message: string): boolean {
  return RAW_PATTERNS.some((item) => item.test(message));
}

export function humanizeAuthError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/401|unauthorized|invalid credentials|密码/i.test(raw)) {
    return "邮箱或密码不正确，请再试一次。";
  }
  if (/409|already exists|已存在|duplicate/i.test(raw)) {
    return "这个邮箱已经注册过了，请直接登录。";
  }
  if (/network|fetch|ECONNREFUSED|Failed to fetch/i.test(raw)) {
    return "现在连不上服务，请稍后重试。";
  }
  if (looksLikeRawTechnicalError(raw) || /Request failed/i.test(raw)) {
    return "这次没能完成登录或注册，请稍后重试。";
  }
  return raw.trim() || "这次没能完成，请稍后重试。";
}

export function toProductError(error: unknown, title: string): ProductErrorV1 {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const technical = looksLikeRawTechnicalError(raw) ? raw : undefined;
  return {
    title,
    humanMessage: "这次没能完成。你可以刷新后重试，已填写的内容还在。",
    recoveryAction: "刷新页面后重试",
    technicalDetails: technical,
  };
}
