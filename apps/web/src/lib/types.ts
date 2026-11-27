export type Role = "owner" | "dentist" | "receptionist" | "assistant";
export type Surface = "M" | "O" | "D" | "B" | "L";
export type ToothStatus = "existing" | "planned" | "completed";
export type FilmType = "PA" | "BW" | "PANO" | "CEPH" | "OTHER";

export interface User {
  id: string;
  clinicId: string;
  name: string;
  role: Role;
  clinicName?: string;
}

export interface Patient {
  id: string;
  hn: string;
  fullName: string;
  birthDate: string;
  sex: "M" | "F";
  phone?: string;
  allergies: string[];
  medicalAlerts: string[];
  dicomPatientId?: string;
  citizenId?: string;
  address?: string;
  emergencyContact?: { name: string; phone: string; relation?: string };
}

export type ChairStatus = "available" | "preparing" | "in_use" | "maintenance";
export interface Chair {
  id: string;
  name: string;
  status: ChairStatus;
  updatedAt: string;
}

export interface Dentist {
  id: string;
  name: string;
}

export type AppointmentStatus = "booked" | "arrived" | "in_room" | "awaiting_payment" | "done" | "cancelled" | "no_show";
export interface Appointment {
  id: string;
  patientId: string;
  dentistId: string;
  chairId?: string;
  /** เวลาไทย YYYY-MM-DDTHH:mm */
  start: string;
  end: string;
  durationMin: number;
  procedure: string;
  note?: string;
  status: AppointmentStatus;
  walkIn?: boolean;
  queueNo?: string;
  arrivedAt?: string;
  calledAt?: string;
  finishedAt?: string;
  patient?: Pick<Patient, "id" | "hn" | "fullName" | "allergies" | "medicalAlerts">;
  dentistName?: string;
  chairName?: string;
}

export const APPT_STATUS: Record<AppointmentStatus, { label: string; tone: "neutral" | "navy" | "warning" | "success" | "danger" }> = {
  booked: { label: "นัดไว้", tone: "neutral" },
  arrived: { label: "มาถึงแล้ว", tone: "warning" },
  in_room: { label: "ในห้องตรวจ", tone: "navy" },
  awaiting_payment: { label: "รอชำระเงิน", tone: "warning" },
  done: { label: "เสร็จแล้ว", tone: "success" },
  cancelled: { label: "ยกเลิก", tone: "neutral" },
  no_show: { label: "ไม่มาตามนัด", tone: "danger" },
};

export const CHAIR_STATUS: Record<ChairStatus, { label: string; dot: string }> = {
  available: { label: "ว่าง", dot: "bg-success" },
  preparing: { label: "กำลังเตรียมห้อง", dot: "bg-warning" },
  in_use: { label: "กำลังรักษา", dot: "bg-navy-600" },
  maintenance: { label: "ปิดซ่อม", dot: "bg-ink-400" },
};

export interface ToothRecord {
  tooth: number;
  surfaces: Partial<Record<Surface, ToothStatus>>;
  whole?: ToothStatus | "missing";
  procedure?: string;
  note?: string;
  updatedAt?: string;
}

export interface XrayImage {
  studyInstanceUid: string;
  seriesInstanceUid: string;
  sopInstanceUid: string;
  modality: string;
  studyDate: string;
  seriesDescription: string;
  rows: number;
  columns: number;
  filmType: FilmType;
  teeth: number[];
}

export interface AuditEntry {
  at: string;
  action: string;
  userName?: string;
  patientName?: string;
  target?: string;
  ip?: string;
}

export interface SoapNote {
  id: string;
  patientId: string;
  visitDate: string; // YYYY-MM-DD
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  teeth: number[];
  authorId: string;
  authorName?: string;
  createdAt: string;
  updatedAt: string;
  signedAt?: string;
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: "เจ้าของคลินิก",
  dentist: "ทันตแพทย์",
  receptionist: "เคาน์เตอร์/การเงิน",
  assistant: "ผู้ช่วยทันตแพทย์",
};

export const FILM_LABEL: Record<FilmType, string> = {
  PA: "PA",
  BW: "Bitewing",
  PANO: "Panoramic",
  CEPH: "Ceph",
  OTHER: "อื่น ๆ",
};
