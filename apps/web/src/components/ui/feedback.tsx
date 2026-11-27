import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-ink-300 bg-white px-6 py-10 text-center",
        className,
      )}
    >
      {icon && (
        <div className="flex size-12 items-center justify-center rounded-full bg-navy-50 text-navy-600 [&_svg]:size-6">{icon}</div>
      )}
      <h2 className="font-semibold text-ink-900">{title}</h2>
      {children && <div className="max-w-md text-sm text-ink-500">{children}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-ink-200/70", className)} />;
}

export function Alert({
  tone = "danger",
  className,
  children,
}: {
  tone?: "danger" | "warning" | "info";
  className?: string;
  children: ReactNode;
}) {
  const t = { danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning", info: "bg-navy-50 text-navy-800" }[tone];
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={cn("rounded-lg px-4 py-3 text-sm", t, className)}>
      {children}
    </p>
  );
}
