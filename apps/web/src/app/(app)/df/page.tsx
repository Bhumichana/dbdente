"use client";

import { DfPage } from "@/components/df/DfPage";
import { useRole } from "@/lib/session";

// รอรู้บทบาทก่อน (เนื้อหาต่างกันตามบทบาท)
export default function Page() {
  return useRole() ? <DfPage /> : null;
}
