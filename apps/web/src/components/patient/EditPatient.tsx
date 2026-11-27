"use client";

import { ShieldAlert } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Patient } from "@/lib/types";
import { PatientForm } from "./PatientForm";

export function EditPatient() {
  const { id } = useParams<{ id: string }>();
  const role = useSession((s) => s.user?.role);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Patient>(`/api/patients/${id}`).then(setPatient, (e: Error) => setError(e.message));
  }, [id]);

  if (role !== "owner" && role !== "receptionist") {
    return (
      <div className="p-6">
        <EmptyState icon={<ShieldAlert />} title="แก้ไขข้อมูลคนไข้ได้เฉพาะเคาน์เตอร์และเจ้าของคลินิก" />
      </div>
    );
  }
  if (error) return <Alert className="m-6">{error}</Alert>;
  if (!patient) return <Skeleton className="m-6 h-64" />;
  return <PatientForm patient={patient} />;
}
