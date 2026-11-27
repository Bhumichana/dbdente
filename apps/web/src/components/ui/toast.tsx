"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { create } from "zustand";
import { cn } from "@/lib/cn";

interface ToastItem {
  id: number;
  message: string;
  tone: "success" | "error";
}

let seq = 0;
const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }));

/** แจ้งผลการทำงานสั้นๆ มุมขวาล่าง หายเองใน 3.5 วินาที (error 6 วินาที) */
export function toast(message: string, tone: ToastItem["tone"] = "success") {
  const id = ++seq;
  useToasts.setState((s) => ({ items: [...s.items, { id, message, tone }] }));
  setTimeout(
    () => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })),
    tone === "error" ? 6000 : 3500,
  );
}

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] flex flex-col items-end gap-2"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={cn(
            "anim-pop pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-lg",
            t.tone === "success" ? "bg-navy-900" : "bg-danger",
          )}
        >
          {t.tone === "success" ? (
            <CircleCheck className="size-4 shrink-0 text-success-soft" />
          ) : (
            <CircleAlert className="size-4 shrink-0" />
          )}
          {t.message}
        </div>
      ))}
    </div>
  );
}
