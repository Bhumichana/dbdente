import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const TONE = {
  neutral: "bg-ink-100 text-ink-600",
  navy: "bg-navy-100 text-navy-700",
  danger: "bg-danger-soft text-danger",
  "danger-solid": "bg-danger text-white",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
} as const;

export type BadgeTone = keyof typeof TONE;

export function Badge({ tone = "neutral", className, ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONE[tone],
        className,
      )}
      {...p}
    />
  );
}
