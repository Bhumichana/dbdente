import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";

/** ทุกหน้าหลัง login: เมนูซ้ายตามบทบาท + แถบบน + ค้นหาคนไข้ (Ctrl K) */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
