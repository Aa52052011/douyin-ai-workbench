import type { HTMLAttributes, ReactNode, TableHTMLAttributes } from "react";
import { cn } from "../../lib/ux/cn";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-[var(--acf-radius-sm)] bg-[var(--acf-surface-subtle)]", className)} {...props} />;
}

export function Table({
  wide,
  className,
  children,
  ...props
}: TableHTMLAttributes<HTMLTableElement> & { wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn("overflow-x-auto", wide && "w-full")}>
      <table className={cn("acf-table w-full min-w-[36rem] text-left text-sm", className)} {...props}>
        {children}
      </table>
    </div>
  );
}
