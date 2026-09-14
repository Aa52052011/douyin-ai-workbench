import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/ux/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="acf-card-title">{children}</h2>;
}
