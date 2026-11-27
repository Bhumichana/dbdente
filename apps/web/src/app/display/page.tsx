import { Suspense } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { QueueDisplay } from "@/components/queue/QueueDisplay";

/** จอเรียกคิว — เปิดบนทีวี/จอหน้าห้องตรวจ (login ด้วยบัญชีเคาน์เตอร์) */
export default function DisplayPage() {
  return (
    <Suspense fallback={null}>
      <ClientOnly>
        <QueueDisplay />
      </ClientOnly>
    </Suspense>
  );
}
