"use client";

import { Dashboard } from "@/components/reports/Dashboard";
import { useRole } from "@/lib/session";

// รอรู้บทบาทก่อน (เนื้อหาต่างกันตามบทบาท)
export default function Page() {
  return useRole() ? <Dashboard /> : null;
}
