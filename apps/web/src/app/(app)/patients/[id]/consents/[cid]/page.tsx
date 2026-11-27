import { Suspense } from "react";
import { ConsentView } from "@/components/consent/ConsentDocument";

export default function ConsentPage() {
  return (
    <Suspense fallback={null}>
      <ConsentView />
    </Suspense>
  );
}
