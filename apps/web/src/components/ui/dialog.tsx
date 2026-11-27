"use client";

import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

/**
 * side="center" = กล่องกลางจอ · side="left" = แผงเลื่อนจากซ้าย (เมนูบนมือถือ)
 * hideHeader ซ่อนหัวเรื่องจากสายตา แต่ screen reader ยังอ่านได้
 */
export function DialogContent({
  title,
  description,
  side = "center",
  hideHeader,
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  side?: "center" | "left";
  hideHeader?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <D.Portal>
      <D.Overlay className="anim-fade fixed inset-0 z-40 bg-navy-950/45" />
      <D.Content
        className={cn(
          "fixed z-50 flex flex-col bg-white shadow-xl outline-none",
          side === "center" &&
            "anim-pop top-[12vh] left-1/2 max-h-[76vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 rounded-2xl",
          side === "left" && "anim-slide inset-y-0 left-0 w-72 max-w-[85vw]",
          className,
        )}
      >
        <div className={cn("flex items-start gap-3 px-5 pt-4", hideHeader && "sr-only")}>
          <div className="min-w-0 flex-1">
            <D.Title className="text-lg font-semibold text-ink-900">{title}</D.Title>
            <D.Description className={cn("text-sm text-ink-500", !description && "sr-only")}>
              {description ?? title}
            </D.Description>
          </div>
          <D.Close aria-label="ปิด" className="-mr-2 rounded-lg p-2 text-ink-500 hover:bg-ink-100">
            <X className="size-5" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
