"use client";

import { useSyncExternalStore } from "react";

/**
 * โหมด Kiosk (แท็บเล็ตให้คนไข้เซ็นเอกสาร): ล็อกเครื่องไว้ที่หน้า /kiosk
 * เก็บใน localStorage → เปิดแท็บใหม่ก็ยังถูกล็อก · ออกได้ด้วย PIN พนักงาน (ตรวจที่ API)
 */
const KEY = "dbdente-kiosk";
const listeners = new Set<() => void>();

export function setKioskLock(on: boolean) {
  if (on) localStorage.setItem(KEY, "1");
  else localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useKioskLock() {
  return useSyncExternalStore(subscribe, () => localStorage.getItem(KEY) === "1", () => false);
}
