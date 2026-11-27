import { Suspense } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { Kiosk } from "@/components/consent/Kiosk";

/** แท็บเล็ตให้คนไข้เซ็นเอกสาร (นอก App shell — ไม่มีเมนู) */
export default function KioskPage() {
  return (
    <Suspense fallback={null}>
      <ClientOnly>
        <Kiosk />
      </ClientOnly>
    </Suspense>
  );
}
