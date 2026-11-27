"use client";

import { ShieldAlert } from "lucide-react";
import { PatientForm } from "@/components/patient/PatientForm";
import { EmptyState } from "@/components/ui/feedback";
import { useRole } from "@/lib/session";

export default function NewPatientPage() {
  const role = useRole();
  if (!role) return null;
  if (role !== "owner" && role !== "receptionist") {
    return (
      <div className="p-6">
        <EmptyState icon={<ShieldAlert />} title="ลงทะเบียนได้เฉพาะเคาน์เตอร์และเจ้าของคลินิก" />
      </div>
    );
  }
  return <PatientForm />;
}
