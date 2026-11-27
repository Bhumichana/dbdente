"use client";

import { LabBoard } from "@/components/lab/LabBoard";
import { useRole } from "@/lib/session";

// รอรู้บทบาทก่อน (เนื้อหาต่างกันตามบทบาท)
export default function Page() {
  return useRole() ? <LabBoard /> : null;
}
