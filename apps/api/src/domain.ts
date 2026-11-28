// โมเดลข้อมูลของเดโม (ระยะ 0 เก็บเป็นไฟล์ JSON — ระยะ 1 จะย้ายไป PostgreSQL/Prisma)

export type Role = "owner" | "dentist" | "receptionist" | "assistant";

export interface Clinic {
  id: string;
  code: string; // ใช้เป็น prefix ของ DICOM PatientID เช่น DEMO01-HN000123
  name: string;
  /** ข้อมูลบนหัวใบเสร็จ */
  address?: string;
  taxId?: string;
  phone?: string;
  /** SHA-256 ของ PIN ออกจากโหมด Kiosk (แท็บเล็ตเซ็นเอกสาร) */
  kioskPinHash?: string;
}

export interface User {
  id: string;
  clinicId: string;
  name: string;
  role: Role;
  /** false = ปิดใช้งาน (ไม่ลบ เพราะเอกสารเก่ายังอ้างถึง) */
  active?: boolean;
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
  /** เลขบัตรประชาชน 13 หลัก (จาก Smart Card / กรอกเอง) */
  citizenId?: string;
  address?: string;
  emergencyContact?: { name: string; phone: string; relation?: string };
  createdAt?: string;
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
    | "SIGN_NOTE"
    | "CREATE_PATIENT"
    | "UPDATE_PATIENT"
    | "CREATE_APPOINTMENT"
    | "UPDATE_APPOINTMENT"
    | "QUEUE_STATUS"
    | "CHAIR_STATUS"
    | "UPDATE_INVOICE"
    | "PAYMENT"
    | "VOID_RECEIPT"
    | "VIEW_RECEIPT"
    | "DAY_CLOSE"
    | "CREATE_CONSENT"
    | "SIGN_CONSENT"
    | "VIEW_CONSENT"
    | "CANCEL_CONSENT"
    | "KIOSK_UNLOCK"
    | "DF_RULE"
    | "VIEW_DF"
    | "CREATE_PLAN"
    | "CANCEL_PLAN"
    | "LAB_CASE"
    | "STOCK_MOVE"
    | "BRIDGE_MATCH"
    | "BRIDGE_RETRY"
    | "SETTINGS";
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

/** เก้าอี้ทำฟัน (Dental Unit) */
export type ChairStatus = "available" | "preparing" | "in_use" | "maintenance";
export interface Chair {
  id: string;
  clinicId: string;
  name: string;
  status: ChairStatus;
  updatedAt: string;
  /** false = ปิดใช้งาน (ไม่ลบ เพราะเอกสารเก่ายังอ้างถึง) */
  active?: boolean;
}

/**
 * นัดหมาย = 1 visit · คิววันนี้คือนัดของวันนี้ที่มาถึงแล้ว (รวม walk-in)
 * booked → arrived (ได้เลขคิว) → in_room → awaiting_payment → done
 * booked → cancelled / no_show
 */
export type AppointmentStatus = "booked" | "arrived" | "in_room" | "awaiting_payment" | "done" | "cancelled" | "no_show";
export interface Appointment {
  id: string;
  clinicId: string;
  patientId: string;
  dentistId: string;
  chairId?: string;
  /** เวลาท้องถิ่น (Asia/Bangkok) YYYY-MM-DDTHH:mm */
  start: string;
  durationMin: number;
  procedure: string;
  note?: string;
  status: AppointmentStatus;
  walkIn?: boolean;
  queueNo?: string;
  arrivedAt?: string;
  calledAt?: string;
  finishedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- การเงิน (จำนวนเงินทั้งหมดเป็นสตางค์ จำนวนเต็ม — กันปัญหาทศนิยม) ----------

/** รายการหัตถการและราคาของคลินิก */
export interface ProcedureItem {
  id: string;
  clinicId: string;
  code: string;
  name: string;
  category: string;
  price: number; // สตางค์
  /** คำที่ใช้จับคู่กับหัตถการในผังฟัน/นัด เพื่อดึงเข้าบิลอัตโนมัติ */
  keywords: string[];
  /** ค่าวัสดุต่อครั้ง (สตางค์) หักก่อนคิด DF */
  materialCost?: number;
  /** วัสดุที่ตัดสต็อกเมื่อรับชำระ (ต่อ 1 หน่วยของรายการ) */
  materials?: { itemId: string; qty: number }[];
  /** false = ปิดใช้งาน (ไม่ลบ เพราะเอกสารเก่ายังอ้างถึง) */
  active?: boolean;
}

export interface InvoiceItem {
  id: string;
  procedureId?: string;
  name: string;
  teeth: number[];
  qty: number;
  unitPrice: number; // สตางค์
  discount: number; // สตางค์ (ทั้งบรรทัด)
  dentistId?: string;
}

/** deposit = ตัดจากมัดจำคงเหลือของคนไข้ */
export type PaymentMethod = "cash" | "transfer" | "card" | "deposit";
export interface Payment {
  method: PaymentMethod;
  amount: number; // สตางค์ ที่ตัดยอดบิล
  /** เงินสดที่รับมา (คำนวณเงินทอน) */
  received?: number;
  /** เลขอ้างอิงการโอน / 4 หลักท้ายบัตร */
  ref?: string;
}

/** บิล 1 ใบต่อ 1 visit · draft → paid (ออกเลขใบเสร็จ) → void (เฉพาะเจ้าของ ก่อนปิดยอด) */
export interface Invoice {
  id: string;
  clinicId: string;
  patientId: string;
  /** service = ค่ารักษา · deposit = รับมัดจำ (ไม่นับเป็นรายได้) · installment = ค่างวดผ่อน */
  kind?: "service" | "deposit" | "installment";
  planId?: string;
  installmentNo?: number;
  appointmentId?: string;
  status: "draft" | "paid" | "void";
  items: InvoiceItem[];
  payments: Payment[];
  total: number;
  receiptNo?: string;
  paidAt?: string;
  paidBy?: string;
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
  /** ปิดยอดรอบไหน (หลังปิดยอดแล้วยกเลิกใบเสร็จไม่ได้) */
  closeId?: string;
  /** ออกแทนใบที่ถูกยกเลิก */
  replaces?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** ปิดยอด (ปิดกะ) — รวมใบเสร็จที่ยังไม่ถูกปิดยอดทั้งหมด */
export interface DayClose {
  id: string;
  clinicId: string;
  closedAt: string;
  closedBy: string;
  receiptCount: number;
  voidCount: number;
  total: number;
  byMethod: Partial<Record<PaymentMethod, number>> & { cash: number; transfer: number };
  /** เงินทอนตั้งต้นในลิ้นชัก */
  float: number;
  cashCounted: number;
  /** นับได้ − (เงินทอนตั้งต้น + รับเงินสด) */
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
  clinicId: string;
  title: string;
  /** ย่อหน้า ใส่ตัวแปร {patient} {procedure} {teeth} {dentist} {clinic} ได้ */
  body: string[];
  checks: ConsentCheck[];
}

/** เอกสารยินยอม: เก็บข้อความที่คนไข้เห็นจริงไว้ทั้งชุด (snapshot) แก้เทมเพลตภายหลังไม่กระทบฉบับที่เซ็นแล้ว */
export interface Consent {
  id: string;
  clinicId: string;
  patientId: string;
  templateId: string;
  title: string;
  procedure: string;
  teeth: number[];
  dentistId: string;
  body: string[];
  checks: ConsentCheck[];
  status: "pending" | "signed" | "cancelled";
  createdBy: string;
  createdAt: string;
  accepted?: Record<string, boolean>;
  signerName?: string;
  signerRelation?: "self" | "parent" | "guardian";
  /** PNG data URL */
  signature?: string;
  signedAt?: string;
  /** SHA-256 ของเนื้อหา + การติ๊ก + ลายเซ็น + เวลา ใช้ตรวจว่าเอกสารไม่ถูกแก้ */
  hash?: string;
}

// ---------- Phase 2–3 ----------

/** กฎค่ามือหมอต่อทันตแพทย์ */
export interface DfRule {
  clinicId: string;
  dentistId: string;
  defaultPercent: number;
  /** % ตามหมวดหัตถการ (ProcedureItem.category) */
  byCategory: Record<string, number>;
  /** ประกันรายได้ขั้นต่ำต่อวันที่เข้าเวร (สตางค์) 0 = ไม่มี */
  dailyMinimum: number;
  updatedAt: string;
  updatedBy: string;
}

/** แผนผ่อนชำระ (จัดฟัน / รากเทียม) — ตารางงวดคำนวณจากค่าในแผน */
export interface InstallmentPlan {
  id: string;
  clinicId: string;
  patientId: string;
  dentistId: string;
  procedureId?: string;
  title: string;
  total: number;
  downPayment: number;
  count: number;
  /** วันครบกำหนดงวดแรก YYYY-MM-DD งวดถัดไป +1 เดือน */
  firstDue: string;
  status: "active" | "completed" | "cancelled";
  note?: string;
  createdBy: string;
  createdAt: string;
}

export interface Lab {
  id: string;
  clinicId: string;
  name: string;
  phone?: string;
  /** false = ปิดใช้งาน (ไม่ลบ เพราะเอกสารเก่ายังอ้างถึง) */
  active?: boolean;
}

export type LabStatus = "sent" | "received" | "fitted" | "remake" | "cancelled";
export interface LabCase {
  id: string;
  clinicId: string;
  patientId: string;
  dentistId: string;
  labId: string;
  work: string;
  teeth: number[];
  shade?: string;
  sentAt: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  receivedAt?: string;
  fittedAt?: string;
  status: LabStatus;
  cost: number; // สตางค์
  /** ผูกกับรายการในบิล → หักค่าแล็บก่อนคิด DF */
  invoiceId?: string;
  invoiceItemId?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockLot {
  id: string;
  lot: string;
  expiry?: string; // YYYY-MM-DD
  qty: number;
}
export interface StockItem {
  id: string;
  clinicId: string;
  code: string;
  name: string;
  unit: string;
  category: string;
  reorderPoint: number;
  lots: StockLot[];
  /** false = ปิดใช้งาน (ไม่ลบ เพราะเอกสารเก่ายังอ้างถึง) */
  active?: boolean;
}
export interface StockMove {
  id: string;
  clinicId: string;
  itemId: string;
  type: "in" | "out" | "adjust";
  /** + เพิ่ม / − ลด */
  qty: number;
  lot?: string;
  reason: string;
  /** อ้างอิงบิล (ตัดตามหัตถการ) */
  ref?: string;
  /** ตัดไม่ครบเพราะของไม่พอ */
  shortage?: number;
  by: string;
  at: string;
}

/** Local Bridge: โปรแกรมเล็กที่ติดตั้งในคลินิก รับไฟล์จากเครื่อง X-ray แล้วส่งเข้า PACS */
export interface Bridge {
  id: string;
  clinicId: string;
  name: string;
  device: string;
  tokenHash: string;
  lastSeenAt?: string;
  version?: string;
  queue?: number;
}
export type BridgeFileStatus = "unmatched" | "matched" | "retry" | "sent" | "failed";
export interface BridgeFile {
  id: string;
  clinicId: string;
  bridgeId: string;
  fileName: string;
  modality: string;
  receivedAt: string;
  status: BridgeFileStatus;
  /** ชื่อ/ID ที่อ่านได้จากไฟล์ (ใช้ช่วยจับคู่) */
  patientHint?: string;
  patientId?: string;
  error?: string;
  attempts: number;
  matchedBy?: string;
  updatedAt: string;
}

export interface Db {
  clinics: Clinic[];
  users: User[];
  patients: Patient[];
  charts: Record<string, Record<number, ToothRecord>>; // patientId -> tooth -> record
  imageLinks: Record<string, ImageLink>; // sopInstanceUid -> link
  notes: SoapNote[];
  chairs: Chair[];
  appointments: Appointment[];
  procedures: ProcedureItem[];
  invoices: Invoice[];
  closes: DayClose[];
  consentTemplates: ConsentTemplate[];
  consents: Consent[];
  dfRules: DfRule[];
  plans: InstallmentPlan[];
  labs: Lab[];
  labCases: LabCase[];
  stockItems: StockItem[];
  stockMoves: StockMove[];
  bridges: Bridge[];
  bridgeFiles: BridgeFile[];
}

export const dicomPatientId = (clinic: Clinic, p: Patient) => p.pacsPatientId || `${clinic.code}-${p.hn}`;
