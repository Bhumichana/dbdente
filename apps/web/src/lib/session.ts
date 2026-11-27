"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "./types";

interface SessionState {
  token: string | null;
  user: User | null;
  setSession: (token: string, user: User) => void;
  logout: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: "dbdente-session" },
  ),
);

/** true เมื่อโหลด session จาก localStorage แล้ว (กัน hydration mismatch) */
const noopSubscribe = () => () => {};
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** บทบาทของผู้ใช้ (undefined ระหว่าง render บน server / ก่อน hydrate) — ใช้ในหน้าที่ render บน server ได้ */
export function useRole() {
  const hydrated = useHydrated();
  const role = useSession((s) => s.user?.role);
  return hydrated ? role : undefined;
}
