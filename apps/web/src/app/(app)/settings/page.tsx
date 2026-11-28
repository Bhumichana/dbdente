"use client";

import { SettingsPage } from "@/components/settings/SettingsPage";
import { useRole } from "@/lib/session";

// เจ้าของเท่านั้น (AppShell กันบทบาทอื่นแล้ว) — รอรู้บทบาทก่อนโหลดข้อมูล
export default function Page() {
  return useRole() === "owner" ? <SettingsPage /> : null;
}
