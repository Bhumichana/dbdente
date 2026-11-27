import { Suspense } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { EditPatient } from "@/components/patient/EditPatient";

export default function EditPatientPage() {
  return (
    <Suspense fallback={null}>
      <ClientOnly>
        <EditPatient />
      </ClientOnly>
    </Suspense>
  );
}
