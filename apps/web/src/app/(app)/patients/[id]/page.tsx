import { Suspense } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { PatientFile } from "@/components/patient/PatientFile";

export default function PatientPage() {
  return (
    <Suspense fallback={null}>
      <ClientOnly>
        <PatientFile />
      </ClientOnly>
    </Suspense>
  );
}
