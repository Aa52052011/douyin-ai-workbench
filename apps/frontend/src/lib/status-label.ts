import { getStatusTone, getUserFacingStatus, uiStatusTone } from "./ui-labels";

export function statusLabel(status: string | null | undefined): string {
  return getUserFacingStatus(status);
}

export function statusTone(status: string | null | undefined): "neutral" | "progress" | "success" | "danger" {
  return uiStatusTone(status);
}

export { getStatusTone, getUserFacingStatus };
