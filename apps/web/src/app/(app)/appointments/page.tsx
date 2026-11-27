"use client";

import { AppointmentCalendar } from "@/components/appointments/AppointmentCalendar";
import { useRole } from "@/lib/session";

export default function AppointmentsPage() {
  return useRole() ? <AppointmentCalendar /> : null;
}
