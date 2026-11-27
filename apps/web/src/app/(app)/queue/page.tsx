"use client";

import { QueueBoard } from "@/components/queue/QueueBoard";
import { useRole } from "@/lib/session";

export default function QueuePage() {
  // รอรู้บทบาทก่อน (ค่าเริ่มต้นของตัวกรองขึ้นกับบทบาท)
  return useRole() ? <QueueBoard /> : null;
}
