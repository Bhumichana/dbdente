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
}

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
