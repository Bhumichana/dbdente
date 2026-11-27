"use client";

import { BridgeStatus } from "@/components/bridge/BridgeStatus";
import { useRole } from "@/lib/session";

// รอรู้บทบาทก่อน (เนื้อหาต่างกันตามบทบาท)
export default function Page() {
  return useRole() ? <BridgeStatus /> : null;
}
