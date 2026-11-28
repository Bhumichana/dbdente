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
  /** แนบมาเฉพาะเจ้าของ/เคาน์เตอร์ */
  invoice?: { id: string; status: InvoiceStatus; total: number; receiptNo?: string };
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

// ---------- การเงิน (จำนวนเงินเป็นสตางค์) ----------
export interface ProcedureItem {
  id: string;
  code: string;
  name: string;
  category: string;
  price: number;
}

export interface InvoiceItem {
  id: string;
  procedureId?: string;
  name: string;
  teeth: number[];
  qty: number;
  unitPrice: number;
  discount: number;
  dentistId?: string;
  dentistName?: string;
}

export type PaymentMethod = "cash" | "transfer" | "card" | "deposit";
export interface Payment {
  method: PaymentMethod;
  amount: number;
  received?: number;
  ref?: string;
}
export const PAYMENT_METHOD: Record<PaymentMethod, string> = { cash: "เงินสด", transfer: "โอน / PromptPay", card: "บัตรเครดิต/เดบิต", deposit: "ตัดมัดจำ" };
export type InvoiceKind = "service" | "deposit" | "installment";

export type InvoiceStatus = "draft" | "paid" | "void";
export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: "warning" | "success" | "neutral" }> = {
  draft: { label: "รอชำระ", tone: "warning" },
  paid: { label: "ชำระแล้ว", tone: "success" },
  void: { label: "ยกเลิก", tone: "neutral" },
};

export interface InvoiceSummary {
  id: string;
  status: InvoiceStatus;
  kind: InvoiceKind;
  total: number;
  receiptNo?: string;
  paidAt?: string;
  createdAt: string;
  closed: boolean;
  methods: PaymentMethod[];
  patient?: Pick<Patient, "id" | "hn" | "fullName" | "allergies">;
  queueNo?: string;
  visitDate: string;
  procedure?: string;
  dentistName?: string;
}

export interface Invoice extends InvoiceSummary {
  patientId: string;
  appointmentId?: string;
  items: InvoiceItem[];
  payments: Payment[];
  paidByName?: string;
  voidReason?: string;
  voidedAt?: string;
  voidedByName?: string;
  replaces?: string;
  clinic?: { name: string; address?: string; taxId?: string; phone?: string };
}

export interface DayClose {
  id: string;
  closedAt: string;
  closedByName?: string;
  receiptCount: number;
  voidCount: number;
  total: number;
  byMethod: Partial<Record<PaymentMethod, number>> & { cash: number; transfer: number };
  float: number;
  cashCounted: number;
  diff: number;
  note?: string;
}

// ---------- E-Consent ----------
export interface ConsentCheck {
  id: string;
  label: string;
  required: boolean;
}
export interface ConsentTemplate {
  id: string;
  title: string;
  body: string[];
  checks: ConsentCheck[];
}
export type ConsentStatus = "pending" | "signed" | "cancelled";
export const CONSENT_STATUS: Record<ConsentStatus, { label: string; tone: "warning" | "success" | "neutral" }> = {
  pending: { label: "รอเซ็น", tone: "warning" },
  signed: { label: "เซ็นแล้ว", tone: "success" },
  cancelled: { label: "ยกเลิก", tone: "neutral" },
};
export interface Consent {
  id: string;
  patientId: string;
  title: string;
  procedure: string;
  teeth: number[];
  body: string[];
  checks: ConsentCheck[];
  status: ConsentStatus;
  createdAt: string;
  createdByName?: string;
  dentistName?: string;
  clinicName?: string;
  patient?: Pick<Patient, "id" | "hn" | "fullName" | "birthDate">;
  accepted?: Record<string, boolean>;
  signerName?: string;
  signerRelation?: "self" | "parent" | "guardian";
  signature?: string;
  signedAt?: string;
  hash?: string;
  verified?: boolean;
}
export const SIGNER_RELATION = { self: "ผู้รับการรักษา", parent: "บิดา/มารดา", guardian: "ผู้ปกครองตามกฎหมาย" } as const;

// ---------- Phase 2–3 ----------
export type PlanRowStatus = "paid" | "billed" | "overdue" | "due" | "upcoming";
export interface PlanRow {
  no: number;
  due: string;
  amount: number;
  status: PlanRowStatus;
  invoiceId?: string;
  receiptNo?: string;
  paidAt?: string;
}
export interface InstallmentPlan {
  id: string;
  patientId: string;
  dentistId: string;
  procedureId?: string;
  title: string;
  total: number;
  downPayment: number;
  count: number;
  firstDue: string;
  status: "active" | "completed" | "cancelled";
  note?: string;
  createdAt: string;
  patient?: Pick<Patient, "id" | "hn" | "fullName" | "phone">;
  dentistName?: string;
  rows: PlanRow[];
  paid: number;
  paidCount: number;
  overdue: PlanRow[];
  next?: PlanRow;
}
export const PLAN_ROW: Record<PlanRowStatus, { label: string; tone: "success" | "navy" | "danger" | "warning" | "neutral" }> = {
  paid: { label: "ชำระแล้ว", tone: "success" },
  billed: { label: "ออกบิลแล้ว", tone: "navy" },
  overdue: { label: "ค้างชำระ", tone: "danger" },
  due: { label: "ครบกำหนดวันนี้", tone: "warning" },
  upcoming: { label: "ยังไม่ถึงกำหนด", tone: "neutral" },
};

export interface DfRule {
  dentistId: string;
  name?: string;
  defaultPercent: number;
  byCategory: Record<string, number>;
  dailyMinimum: number;
  updatedAt: string;
}
export interface DfLine {
  date: string;
  invoiceId: string;
  receiptNo?: string;
  itemId: string;
  patientName?: string;
  category: string;
  name: string;
  net: number;
  materialCost: number;
  labCost: number;
  base: number;
  percent: number;
  df: number;
}
export interface DfSummary {
  dentistId: string;
  name?: string;
  rule: DfRule;
  revenue: number;
  materialCost: number;
  labCost: number;
  df: number;
  topUp: number;
  total: number;
  days: { date: string; revenue: number; df: number; topUp: number }[];
  lines?: DfLine[];
}

export type LabStatus = "sent" | "received" | "fitted" | "remake" | "cancelled";
export const LAB_STATUS: Record<LabStatus, { label: string; tone: "navy" | "success" | "warning" | "neutral" }> = {
  sent: { label: "ส่งแล็บแล้ว", tone: "navy" },
  received: { label: "รับงานแล้ว รอใส่", tone: "warning" },
  fitted: { label: "ใส่ให้คนไข้แล้ว", tone: "success" },
  remake: { label: "ส่งแก้", tone: "warning" },
  cancelled: { label: "ยกเลิก", tone: "neutral" },
};
export interface Lab {
  id: string;
  name: string;
  phone?: string;
}
export interface LabCase {
  id: string;
  patientId: string;
  dentistId: string;
  labId: string;
  work: string;
  teeth: number[];
  shade?: string;
  sentAt: string;
  dueDate: string;
  receivedAt?: string;
  fittedAt?: string;
  status: LabStatus;
  cost: number;
  invoiceItemId?: string;
  note?: string;
  patient?: Pick<Patient, "id" | "hn" | "fullName">;
  dentistName?: string;
  labName?: string;
  linkedItem?: string;
  linkedReceipt?: string;
  overdue: boolean;
  dueSoon: boolean;
}

export interface StockLot {
  id: string;
  lot: string;
  expiry?: string;
  qty: number;
}
export interface StockItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string;
  reorderPoint: number;
  lots: StockLot[];
  onHand: number;
  low: boolean;
  expired: number;
  expiringSoon: number;
  nextExpiry?: string;
}
export interface StockMove {
  id: string;
  itemId: string;
  itemName?: string;
  type: "in" | "out" | "adjust";
  qty: number;
  lot?: string;
  reason: string;
  shortage?: number;
  byName?: string;
  at: string;
}

export interface Bridge {
  id: string;
  name: string;
  device: string;
  lastSeenAt?: string;
  version?: string;
  queue?: number;
  online: boolean;
  sentToday: number;
}
export type BridgeFileStatus = "unmatched" | "matched" | "retry" | "sent" | "failed";
export const BRIDGE_FILE: Record<BridgeFileStatus, { label: string; tone: "warning" | "navy" | "success" | "danger" }> = {
  unmatched: { label: "รอจับคู่ HN", tone: "warning" },
  matched: { label: "จับคู่แล้ว รอส่ง", tone: "navy" },
  retry: { label: "รอส่งซ้ำ", tone: "navy" },
  sent: { label: "ส่งเข้า PACS แล้ว", tone: "success" },
  failed: { label: "ส่งไม่สำเร็จ", tone: "danger" },
};
export interface BridgeFile {
  id: string;
  bridgeId: string;
  bridgeName?: string;
  fileName: string;
  modality: string;
  receivedAt: string;
  status: BridgeFileStatus;
  patientHint?: string;
  patient?: Pick<Patient, "id" | "hn" | "fullName">;
  error?: string;
  attempts: number;
  updatedAt: string;
}

export interface ReportSummary {
  from: string;
  to: string;
  scope: "clinic" | "self";
  kpis: {
    revenue: number;
    prevRevenue: number;
    visits: number;
    avgPerVisit: number;
    newPatients: number;
    noShow: number;
    showRate: number | null;
  };
  byDay: { date: string; revenue: number }[];
  byDentist: { label: string; revenue: number }[];
  byCategory: { label: string; revenue: number }[];
  topProcedures: { label: string; revenue: number }[];
  watch?: { outstanding: number; deposits: number; labOverdue: number; stockLow: number };
}

// ---------- ตั้งค่าคลินิก (เจ้าของเท่านั้น) ----------
/** active: false = ปิดใช้งาน (ไม่แสดงในตัวเลือกของหน้าอื่น แต่เอกสารเก่ายังอ้างถึงได้) */
export interface SettingsClinic {
  id: string;
  code: string;
  name: string;
  address?: string;
  taxId?: string;
  phone?: string;
  hasKioskPin: boolean;
}
export interface SettingsProcedure {
  id: string;
  code: string;
  name: string;
  category: string;
  price: number;
  keywords: string[];
  materialCost?: number;
  materials?: { itemId: string; qty: number }[];
  active?: boolean;
}
export interface SettingsMaterial {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string;
  reorderPoint: number;
  onHand: number;
  active?: boolean;
}
export interface SettingsLab {
  id: string;
  name: string;
  phone?: string;
  openCases: number;
  active?: boolean;
}
export interface SettingsChair {
  id: string;
  name: string;
  status: ChairStatus;
  upcoming: number;
  active?: boolean;
}
export interface SettingsUser {
  id: string;
  name: string;
  role: Role;
  active?: boolean;
}
export interface SettingsData {
  clinic: SettingsClinic;
  procedures: SettingsProcedure[];
  materials: SettingsMaterial[];
  labs: SettingsLab[];
  chairs: SettingsChair[];
  users: SettingsUser[];
}
