import { Suspense } from "react";
import { BillingWorkspace } from "@/components/billing/BillingWorkspace";

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingWorkspace />
    </Suspense>
  );
}
