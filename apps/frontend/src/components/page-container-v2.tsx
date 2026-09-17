import type { ReactNode } from "react";
import { cn } from "../lib/ux/cn";

export function PageContainerV2({
  children,
  width = "default",
  className,
}: {
  children: ReactNode;
  width?: "default" | "wide" | "form" | "reading";
  className?: string;
}) {
  const widthClass =
    width === "wide"
      ? "acf-content-wide"
      : width === "form"
        ? "acf-form-container"
        : width === "reading"
          ? "acf-reading-container"
          : "acf-page-container";
  return <div className={cn(widthClass, className)}>{children}</div>;
}
