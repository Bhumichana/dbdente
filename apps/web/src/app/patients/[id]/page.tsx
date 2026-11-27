import { Suspense } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { TreatmentScreen } from "@/components/TreatmentScreen";

export default function PatientPage() {
  return (
    <Suspense fallback={null}>
      <ClientOnly>
        <TreatmentScreen />
      </ClientOnly>
    </Suspense>
  );
}
