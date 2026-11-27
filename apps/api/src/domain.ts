// โมเดลข้อมูลของเดโม (ระยะ 0 เก็บเป็นไฟล์ JSON — ระยะ 1 จะย้ายไป PostgreSQL/Prisma)

export type Role = "owner" | "dentist" | "receptionist" | "assistant";

export interface Clinic {
  id: string;
  code: string; // ใช้เป็น prefix ของ DICOM PatientID เช่น DEMO01-HN000123
  name: string;
}

export interface User {
  id: string;
  clinicId: string;
  name: string;
  role: Role;
}

export interface Patient {
  id: string;
  clinicId: string;
  hn: string;
  fullName: string;
  birthDate: string; // YYYY-MM-DD
  sex: "M" | "F";
  phone?: string;
  allergies: string[];
  medicalAlerts: string[];
  /** PatientID ที่มีอยู่แล้วใน PACS (ใช้แทนรูปแบบ {clinic}-{HN} เช่น ตอนผูกกับข้อมูลเดิม) */
  pacsPatientId?: string;
}

export type Surface = "M" | "O" | "D" | "B" | "L";
export type ToothStatus = "existing" | "planned" | "completed";

export interface ToothRecord {
  tooth: number; // FDI
  surfaces: Partial<Record<Surface, ToothStatus>>;
  whole?: ToothStatus | "missing"; // หัตถการทั้งซี่ เช่น ครอบฟัน / RCT / ถอน
  procedure?: string;
  note?: string;
  updatedAt: string;
  updatedBy: string;
}

export type FilmType = "PA" | "BW" | "PANO" | "CEPH" | "OTHER";

export interface ImageLink {
  sopInstanceUid: string;
  patientId: string;
  filmType: FilmType;
  teeth: number[];
}

export interface AuditEntry {
  at: string;
  userId: string;
  clinicId: string;
  action:
    | "LOGIN"
    | "VIEW_PATIENT"
    | "VIEW_IMAGE"
    | "UPLOAD_IMAGE"
    | "UPDATE_CHART"
    | "LINK_IMAGE"
    | "CREATE_NOTE"
    | "UPDATE_NOTE"
    | "SIGN_NOTE";
  patientId?: string;
  target?: string;
  ip?: string;
}

/** บันทึกการรักษาแบบ SOAP — 1 รายการต่อ 1 visit ต่อทันตแพทย์ ลงนามแล้วแก้ไม่ได้ */
export interface SoapNote {
  id: string;
  clinicId: string;
  patientId: string;
  visitDate: string; // YYYY-MM-DD
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  teeth: number[];
  authorId: string;
  createdAt: string;
  updatedAt: string;
  signedAt?: string;
}

export interface Db {
  clinics: Clinic[];
  users: User[];
  patients: Patient[];
  charts: Record<string, Record<number, ToothRecord>>; // patientId -> tooth -> record
  imageLinks: Record<string, ImageLink>; // sopInstanceUid -> link
  notes: SoapNote[];
}

export const dicomPatientId = (clinic: Clinic, p: Patient) => p.pacsPatientId || `${clinic.code}-${p.hn}`;
