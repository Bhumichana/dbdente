"use client";

import { useHydrated } from "@/lib/session";

/** แสดงเฉพาะฝั่ง browser (หลัง hydrate) — การตรวจ login อยู่ที่ AppShell */
export function ClientOnly({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  return hydrated ? <>{children}</> : null;
}
