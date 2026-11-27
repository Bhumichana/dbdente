"use client";

import { RequireSession } from "@/components/AppHeader";
import { useHydrated } from "@/lib/session";

/** แสดงหลังโหลด session จาก localStorage แล้ว และต้อง login */
export function ClientOnly({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return <RequireSession>{children}</RequireSession>;
}
