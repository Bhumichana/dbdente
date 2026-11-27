"use client";

import { Tabs as T } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** แท็บ (Radix: ลูกศรซ้าย/ขวาเลื่อนแท็บได้ และ screen reader รู้ว่าเป็นแท็บ) */
export const Tabs = T.Root;

export function TabsList({ className, ...p }: ComponentProps<typeof T.List>) {
  return (
    <T.List
      className={cn("flex shrink-0 gap-1 overflow-x-auto border-b border-ink-200 bg-white px-2 sm:px-4", className)}
      {...p}
    />
  );
}

export function TabsTrigger({ className, ...p }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "-mb-px flex h-11 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm whitespace-nowrap text-ink-500 transition-colors",
        "hover:text-ink-800 data-[state=active]:border-navy-700 data-[state=active]:font-semibold data-[state=active]:text-navy-700",
        "[&_svg]:size-4",
        className,
      )}
      {...p}
    />
  );
}

export function TabsContent({ className, ...p }: ComponentProps<typeof T.Content>) {
  return <T.Content className={cn("min-h-0 flex-1 outline-none", className)} {...p} />;
}
