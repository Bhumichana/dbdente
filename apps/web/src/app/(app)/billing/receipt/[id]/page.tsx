import { Suspense } from "react";
import { Receipt } from "@/components/billing/Receipt";

export default function ReceiptPage() {
  return (
    <Suspense fallback={null}>
      <Receipt />
    </Suspense>
  );
}
