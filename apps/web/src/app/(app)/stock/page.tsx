"use client";

import { StockBoard } from "@/components/stock/StockBoard";
import { useRole } from "@/lib/session";

// รอรู้บทบาทก่อน (เนื้อหาต่างกันตามบทบาท)
export default function Page() {
  return useRole() ? <StockBoard /> : null;
}
