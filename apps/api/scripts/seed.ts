/**
 * สร้างข้อมูลเดโม: คลินิก ผู้ใช้ 4 บทบาท คนไข้ ผังฟัน และภาพ X-ray สังเคราะห์
 *   npm run seed            → ล้างข้อมูลเดิม แล้วสร้างใหม่ (ภาพส่งไปยัง IMAGE_SOURCE ที่ตั้งไว้ใน .env)
 * ข้อมูลทั้งหมดเป็นข้อมูลสมมติ
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dcmjs from "dcmjs";
import { config } from "../src/config.js";
import {
  dicomPatientId,
  type Appointment,
  type AppointmentStatus,
  type Chair,
  type Clinic,
  type Db,
  type FilmType,
  type Patient,
  type ToothRecord,
} from "../src/domain.js";
import { draftItems, invoiceTotal } from "../src/billing.js";
import { sha256 } from "../src/consent.js";
import { seedOperations } from "./seed-ops.js";
import { createImageSource } from "../src/imaging/index.js";
import { replaceDb } from "../src/store.js";
import { bitewingRight, pa11, pa36, panoramic } from "./synth.js";

// ---------- reset ----------
fs.rmSync(path.join(config.dataDir, "db.json"), { force: true });
fs.rmSync(path.join(config.dataDir, "audit.log"), { force: true });
if (config.imageSource === "local") fs.rmSync(path.join(config.dataDir, "dicom"), { recursive: true, force: true });

// UID แบบคงที่ (2.25.<uuid เป็นเลขฐาน 10>) — seed ซ้ำได้ UID เดิม
const uid = (key: string) => {
  const hex = crypto.createHash("sha256").update(`dbdente:${key}`).digest("hex").slice(0, 32);
  return `2.25.${BigInt("0x" + hex).toString()}`;
};

const clinic: Clinic = {
  id: "c1",
  code: "DEMO01",
  name: "คลินิกทันตกรรมยิ้มสวย (เดโม)",
  address: "99/9 ถนนสุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพฯ 10110",
  taxId: "0000000000000",
  phone: "02-000-0000",
  kioskPinHash: sha256("2468"), // PIN เดโมสำหรับออกจากโหมด Kiosk
};

const patients: Patient[] = [
  {
    id: "p1",
    clinicId: clinic.id,
    hn: "HN000123",
    fullName: "สมชาย ใจดี",
    birthDate: "1984-03-14",
    sex: "M",
    phone: "081-000-0001",
    allergies: ["Penicillin", "Ibuprofen"],
    medicalAlerts: ["ความดันโลหิตสูง", "ทานยาละลายลิ่มเลือด (Warfarin)"],
  },
  {
    id: "p2",
    clinicId: clinic.id,
    hn: "HN000124",
    fullName: "วิภาดา แสงทอง",
    birthDate: "1992-11-02",
    sex: "F",
    phone: "081-000-0002",
    allergies: [],
    medicalAlerts: ["ตั้งครรภ์ 20 สัปดาห์"],
  },
  {
    id: "p3",
    clinicId: clinic.id,
    hn: "HN000125",
    fullName: "ด.ช. ภูมิ รักเรียน",
    birthDate: "2018-06-20",
    sex: "M",
    allergies: [],
    medicalAlerts: [],
  },
];

// คนไข้เพิ่มเติมสำหรับคิว/นัดหมาย (ข้อมูลสมมติ)
const extra: [string, string, string, "M" | "F", string[], string[]][] = [
  ["p4", "วรรณา ศรีทอง", "1979-02-11", "F", [], []],
  ["p5", "สมพร ดีใจ", "1965-07-30", "M", [], ["เบาหวาน"]],
  ["p6", "ปกรณ์ ใจเย็น", "1988-12-05", "M", ["Sulfa"], []],
  ["p7", "นภา ใจงาม", "2006-04-18", "F", [], []],
  ["p8", "กมล ศรีสุข", "1995-09-23", "F", [], []],
  ["p9", "ชัยวัฒน์ พูนผล", "1972-01-09", "M", [], ["ความดันโลหิตสูง"]],
];
extra.forEach(([id, fullName, birthDate, sex, allergies, medicalAlerts], i) =>
  patients.push({
    id,
    clinicId: clinic.id,
    hn: `HN${String(126 + i).padStart(6, "0")}`,
    fullName,
    birthDate,
    sex,
    phone: `081-000-${String(4 + i).padStart(4, "0")}`,
    allergies,
    medicalAlerts,
  }),
);

const now = new Date().toISOString();
const rec = (tooth: number, r: Omit<ToothRecord, "tooth" | "updatedAt" | "updatedBy">): ToothRecord => ({
  tooth,
  updatedAt: now,
  updatedBy: "u2",
  ...r,
});

const db: Db = {
  clinics: [clinic],
  users: [
    { id: "u1", clinicId: clinic.id, name: "ทพ. ธนา เจ้าของคลินิก", role: "owner" },
    { id: "u2", clinicId: clinic.id, name: "ทพญ. ปริยา รักษ์ฟัน", role: "dentist" },
    { id: "u3", clinicId: clinic.id, name: "มาลี (เคาน์เตอร์)", role: "receptionist" },
    { id: "u4", clinicId: clinic.id, name: "สุดา (ผู้ช่วยทันตแพทย์)", role: "assistant" },
    { id: "u5", clinicId: clinic.id, name: "ทพ. กิตติ ศักดิ์ดี (จัดฟัน)", role: "dentist" },
  ],
  patients,
  charts: {
    p1: {
      36: rec(36, { surfaces: { M: "completed", O: "completed" }, whole: "completed", procedure: "RCT + Crown", note: "Periapical lesion ที่รากใกล้กลาง ติดตามผลหลังรักษาครบ 3 เดือน" }),
      37: rec(37, { surfaces: { O: "existing" }, procedure: "Amalgam filling (เดิม)" }),
      17: rec(17, { surfaces: {}, whole: "missing" }),
      26: rec(26, { surfaces: { O: "existing" }, procedure: "Composite (เดิม)" }),
      15: rec(15, { surfaces: { D: "existing", O: "existing" }, procedure: "Composite DO (เดิม)" }),
      45: rec(45, { surfaces: { D: "planned" }, procedure: "Composite D" }),
      11: rec(11, { surfaces: { M: "planned" }, procedure: "Composite M" }),
    },
    p2: {
      46: rec(46, { surfaces: { O: "planned", D: "planned" }, procedure: "Composite DO" }),
      38: rec(38, { surfaces: {}, whole: "planned", procedure: "ผ่าฟันคุด" }),
    },
    p3: {
      75: rec(75, { surfaces: { O: "planned" }, procedure: "Sealant" }),
      85: rec(85, { surfaces: { O: "existing" }, procedure: "Sealant (เดิม)" }),
    },
  },
  imageLinks: {},
  notes: [],
  chairs: [],
  appointments: [],
  procedures: [],
  invoices: [],
  closes: [],
  consentTemplates: [],
  consents: [],
  dfRules: [],
  plans: [],
  labs: [],
  labCases: [],
  stockItems: [],
  stockMoves: [],
  bridges: [],
  bridgeFiles: [],
};

// ---------- เก้าอี้ + นัดหมายของวันนี้/พรุ่งนี้ (สถานะเหมือนช่วงสายของวัน) ----------
const chairStatus: Chair["status"][] = ["in_use", "preparing", "in_use", "available", "maintenance"];
db.chairs = chairStatus.map((status, i) => ({ id: `ch${i + 1}`, clinicId: clinic.id, name: `Unit ${i + 1}`, status, updatedAt: now }));

const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
const at = (date: string, hm: string) => new Date(`${date}T${hm}:00+07:00`).toISOString();

// เวลานัดของวันนี้อิงเวลาปัจจุบัน (seed ตอนไหนก็ได้คิวที่ดูสมจริง) — นอกเวลาทำการใช้ 11:00
const nowTH = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour12: false }).slice(0, 5);
const nowMin = Number(nowTH.slice(0, 2)) * 60 + Number(nowTH.slice(3, 5));
const base = nowMin >= 10 * 60 + 30 && nowMin <= 17 * 60 ? Math.floor(nowMin / 5) * 5 : 11 * 60;
/** เวลาวันนี้ = base + offset นาที (ปัดเป็น 15 นาที สำหรับเวลานัด) */
const t = (offset: number, round = 15) => {
  const m = Math.round((base + offset) / round) * round;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
let q = 0;
const appt = (
  date: string,
  hm: string,
  durationMin: number,
  patientId: string,
  dentistId: string,
  chairId: string | undefined,
  procedure: string,
  status: AppointmentStatus,
  arrived?: string,
  called?: string,
): Appointment => ({
  id: uid(`appt:${date}:${hm}:${patientId}`).slice(-16),
  clinicId: clinic.id,
  patientId,
  dentistId,
  chairId,
  start: `${date}T${hm}`,
  durationMin,
  procedure,
  status,
  queueNo: arrived ? `A${String(++q).padStart(3, "0")}` : undefined,
  arrivedAt: arrived && at(date, arrived),
  calledAt: ["in_room", "awaiting_payment", "done"].includes(status) ? at(date, called ?? hm) : undefined,
  createdBy: "u3",
  createdAt: now,
  updatedAt: now,
});
db.appointments = [
  // [เวลานัด, มาถึง, เรียกเข้าห้อง] อิงเวลาปัจจุบัน
  appt(today, t(-120), 50, "p4", "u2", "ch1", "ถอนฟัน 48", "done", t(-130, 1)),
  appt(today, t(-120), 30, "p5", "u1", "ch2", "ตรวจสุขภาพช่องปาก", "done", t(-125, 1)),
  appt(today, t(-75), 60, "p6", "u1", "ch2", "ครอบฟัน 26 (ลองครอบ)", "awaiting_payment", t(-85, 1), t(-75, 1)),
  appt(today, t(-30), 45, "p3", "u2", "ch1", "Sealant 75", "in_room", t(-38, 1), t(-25, 1)),
  appt(today, t(-15), 60, "p7", "u5", "ch3", "ปรับลวดจัดฟัน (งวด 4/24)", "in_room", t(-22, 1), t(-12, 1)),
  appt(today, t(15), 45, "p1", "u2", "ch1", "RCT 36 — ติดตามผล + พิมพ์ครอบฟัน", "arrived", t(-18, 1)),
  appt(today, t(0), 30, "p8", "u1", "ch2", "ขูดหินปูน", "arrived", t(-6, 1)),
  appt(today, t(60), 45, "p2", "u2", "ch1", "อุดฟัน 46 DO", "booked"),
  appt(today, t(120), 60, "p9", "u1", "ch4", "ขูดหินปูน + ตรวจฟัน", "booked"),
  appt(today, t(150), 90, "p5", "u5", "ch3", "ติดเครื่องมือจัดฟัน", "booked"),
  appt(tomorrow, "09:30", 60, "p6", "u1", "ch2", "ยึดครอบฟัน 26", "booked"),
  appt(tomorrow, "10:00", 30, "p8", "u2", "ch1", "ตรวจติดตามผล", "booked"),
  appt(tomorrow, "13:30", 60, "p7", "u5", "ch3", "ปรับลวดจัดฟัน", "booked"),
];

// ---------- รายการหัตถการและราคา (บาท → สตางค์) ----------
const proc = (code: string, category: string, name: string, baht: number, keywords: string[]) => ({
  id: `pr-${code.toLowerCase()}`,
  clinicId: clinic.id,
  code,
  category,
  name,
  price: baht * 100,
  keywords,
});
db.procedures = [
  proc("EXAM", "ตรวจและวินิจฉัย", "ตรวจสุขภาพช่องปาก", 300, ["ตรวจ", "exam"]),
  proc("PA", "ตรวจและวินิจฉัย", "ถ่ายภาพรังสี PA", 200, ["ฟิล์ม pa", "periapical"]),
  proc("PANO", "ตรวจและวินิจฉัย", "ถ่ายภาพรังสี Panoramic", 800, ["panoramic", "pano"]),
  proc("SCALE", "ป้องกัน", "ขูดหินปูนและขัดฟัน", 800, ["ขูดหินปูน", "scaling"]),
  proc("FLUOR", "ป้องกัน", "เคลือบฟลูออไรด์", 400, ["ฟลูออไรด์", "fluoride"]),
  proc("SEAL", "ป้องกัน", "เคลือบหลุมร่องฟัน (Sealant)", 500, ["sealant"]),
  proc("COMP1", "อุดฟัน", "อุดฟัน Composite 1 ด้าน", 900, ["composite", "อุด"]),
  proc("COMP2", "อุดฟัน", "อุดฟัน Composite 2 ด้าน", 1200, []),
  proc("EXT", "ศัลยกรรม", "ถอนฟัน", 800, ["ถอน", "extraction"]),
  proc("SURG", "ศัลยกรรม", "ผ่าฟันคุด", 3500, ["ผ่าฟันคุด", "impact"]),
  proc("RCTM", "รักษารากฟัน", "รักษารากฟัน (ฟันกราม)", 7000, ["rct", "รักษาราก", "root canal"]),
  proc("CROWN", "ทันตกรรมประดิษฐ์", "ครอบฟันเซรามิก (PFM)", 12000, ["ครอบ", "crown"]),
  proc("ORTHO", "จัดฟัน", "ปรับเครื่องมือจัดฟัน (รายเดือน)", 1500, ["ปรับลวด", "จัดฟัน"]),
  proc("MED", "ยาและอื่นๆ", "ยา Paracetamol 500 mg × 10", 50, []),
];

// ---------- บิล: visit ที่จบแล้ววันนี้ชำระแล้ว 2 ใบ, รอชำระ 1 ใบ ----------
for (const [pid, method] of [["p4", "cash"], ["p5", "transfer"]] as const) {
  const a = db.appointments.find((x) => x.patientId === pid && x.status === "done")!;
  const items = draftItems(db, a);
  const total = invoiceTotal(items);
  const paidAt = new Date(new Date(a.calledAt!).getTime() + a.durationMin * 60_000).toISOString();
  db.invoices.push({
    id: uid(`inv:${a.id}`).slice(-16),
    clinicId: clinic.id,
    patientId: pid,
    appointmentId: a.id,
    status: "paid",
    items,
    payments: method === "cash" ? [{ method, amount: total, received: Math.ceil(total / 100_000) * 100_000 }] : [{ method, amount: total, ref: "PromptPay 0042" }],
    total,
    paidAt,
    paidBy: "u3",
    createdBy: a.dentistId,
    createdAt: paidAt,
    updatedAt: paidAt,
  });
}
{
  const a = db.appointments.find((x) => x.status === "awaiting_payment")!;
  const items = draftItems(db, a);
  db.invoices.push({
    id: uid(`inv:${a.id}`).slice(-16),
    clinicId: clinic.id,
    patientId: a.patientId,
    appointmentId: a.id,
    status: "draft",
    items,
    payments: [],
    total: invoiceTotal(items),
    createdBy: a.dentistId,
    createdAt: now,
    updatedAt: now,
  });
}

// ---------- Phase 2–3: ประวัติย้อนหลัง, แผนผ่อน, มัดจำ, DF, แล็บ, สต็อก, Bridge (+ ออกเลขใบเสร็จ/ปิดยอดวันก่อนๆ) ----------
seedOperations(db, { clinicId: clinic.id, today, uid });

// ---------- เทมเพลตเอกสารยินยอม (ข้อความตัวอย่าง — ใช้จริงต้องให้ที่ปรึกษากฎหมายตรวจ) ----------
const PDPA_CHECKS = [
  { id: "treat", label: "ข้าพเจ้ายินยอมรับการรักษาตามที่ระบุ", required: true },
  { id: "health", label: "ยินยอมให้คลินิกเก็บและใช้ข้อมูลสุขภาพ รวมถึงภาพรังสี เพื่อการรักษา (PDPA)", required: true },
  { id: "line", label: "ยินยอมรับข่าวสารและการแจ้งเตือนนัดทาง LINE (ไม่บังคับ)", required: false },
];
const COMMON = [
  "ข้าพเจ้าได้รับคำอธิบายเรื่องค่าใช้จ่ายโดยประมาณ และทราบว่าค่าใช้จ่ายอาจเปลี่ยนแปลงได้หากพบสภาวะที่ไม่คาดคิดระหว่างการรักษา",
  "ข้าพเจ้าเข้าใจว่าอาจต้องถ่ายภาพรังสีเพิ่มเติมระหว่างการรักษา และภาพดังกล่าวจะถูกจัดเก็บเป็นส่วนหนึ่งของเวชระเบียน",
  "ข้าพเจ้ามีโอกาสซักถามจนเข้าใจ และสามารถเปลี่ยนใจไม่รับการรักษาได้ก่อนเริ่มหัตถการ",
];
db.consentTemplates = [
  {
    id: "ct-general",
    clinicId: clinic.id,
    title: "หนังสือยินยอมรับการรักษาทางทันตกรรม",
    body: [
      "ข้าพเจ้า {patient} ยินยอมรับการรักษา “{procedure}” {teeth} ที่ {clinic} โดย {dentist}",
      "ข้าพเจ้าได้รับคำอธิบายจากทันตแพทย์ถึงขั้นตอน ระยะเวลา ผลข้างเคียงที่อาจเกิดขึ้น และทางเลือกอื่นในการรักษาแล้ว",
      ...COMMON,
    ],
    checks: PDPA_CHECKS,
  },
  {
    id: "ct-rct",
    clinicId: clinic.id,
    title: "หนังสือยินยอมการรักษาคลองรากฟัน (Root Canal Treatment)",
    body: [
      "ข้าพเจ้า {patient} ยินยอมรับการรักษาคลองรากฟัน {teeth} โดย {dentist}",
      "ทันตแพทย์อธิบายแล้วว่าการรักษาคลองรากฟันมักต้องมาหลายครั้ง และหลังรักษาอาจมีอาการเจ็บเมื่อเคี้ยวได้ 2–3 วัน",
      "ข้าพเจ้าทราบว่าเครื่องมือขนาดเล็กอาจหักค้างในคลองราก หรือพบคลองรากที่ตีบตัน ซึ่งอาจต้องรักษาเพิ่มเติมหรือส่งต่อทันตแพทย์เฉพาะทาง",
      "ฟันที่รักษาคลองรากแล้วจะเปราะกว่าเดิม ทันตแพทย์แนะนำให้ทำครอบฟันเพื่อป้องกันฟันแตก",
      ...COMMON,
    ],
    checks: PDPA_CHECKS,
  },
  {
    id: "ct-ext",
    clinicId: clinic.id,
    title: "หนังสือยินยอมการถอนฟัน / ผ่าฟันคุด",
    body: [
      "ข้าพเจ้า {patient} ยินยอมรับการ “{procedure}” {teeth} โดย {dentist}",
      "ทันตแพทย์อธิบายแล้วว่าหลังถอนฟันหรือผ่าฟันคุดอาจมีอาการปวด บวม เลือดซึม หรืออ้าปากได้น้อยลงชั่วคราว",
      "ในบางกรณีอาจเกิดอาการชาริมฝีปากหรือลิ้นจากการที่รากฟันอยู่ใกล้เส้นประสาท ซึ่งส่วนใหญ่หายได้เอง",
      "ข้าพเจ้าได้แจ้งประวัติการแพ้ยา โรคประจำตัว และยาที่ใช้อยู่ (เช่น ยาละลายลิ่มเลือด) ให้ทันตแพทย์ทราบครบถ้วนแล้ว",
      ...COMMON,
    ],
    checks: PDPA_CHECKS,
  },
  {
    id: "ct-pdpa",
    clinicId: clinic.id,
    title: "หนังสือให้ความยินยอมเก็บรวบรวมและใช้ข้อมูลส่วนบุคคล (PDPA)",
    body: [
      "ข้าพเจ้า {patient} รับทราบว่า {clinic} เก็บข้อมูลส่วนบุคคลและข้อมูลสุขภาพ ได้แก่ ประวัติการรักษา ผังฟัน และภาพรังสี เพื่อใช้ในการรักษาและติดต่อนัดหมาย",
      "คลินิกจะไม่เปิดเผยข้อมูลแก่บุคคลภายนอก เว้นแต่ได้รับความยินยอม หรือเป็นไปตามที่กฎหมายกำหนด",
      "ข้าพเจ้ามีสิทธิ์ขอเข้าถึง ขอสำเนา ขอแก้ไข และขอถอนความยินยอมได้ โดยแจ้งที่เคาน์เตอร์ของคลินิก",
    ],
    checks: PDPA_CHECKS.slice(1),
  },
];

// ---------- SOAP notes (visit ที่ผ่านมา — ลงนามแล้ว) ----------
const note = (
  patientId: string,
  visitDate: string,
  teeth: number[],
  soap: { s: string; o: string; a: string; p: string },
): Db["notes"][number] => {
  const at = `${visitDate}T10:30:00.000Z`;
  return {
    id: uid(`note:${patientId}:${visitDate}`).slice(-16),
    clinicId: clinic.id,
    patientId,
    visitDate,
    subjective: soap.s,
    objective: soap.o,
    assessment: soap.a,
    plan: soap.p,
    teeth,
    authorId: "u2",
    createdAt: at,
    updatedAt: at,
    signedAt: at,
  };
};
db.notes.push(
  note("p1", "2025-11-03", [], {
    s: "มาตรวจสุขภาพช่องปากประจำปี ไม่มีอาการปวด",
    o: "ฟันผุซี่ 45 ด้าน D, 11 ด้าน M ระยะเริ่มต้น · หินปูนเล็กน้อย · 17 ถอนไปแล้ว",
    a: "Initial caries 45D, 11M · Mild gingivitis",
    p: "ขูดหินปูนวันนี้ · นัดอุดฟัน 45, 11 · ถ่าย Panoramic เก็บเป็นข้อมูลพื้นฐาน",
  }),
  note("p1", "2026-05-12", [36], {
    s: "ปวดฟันกรามล่างซ้ายเวลาเคี้ยว ปวดตอนกลางคืน 1 สัปดาห์",
    o: "36 ผุลึกด้าน MO · เคาะเจ็บ (+) · Cold test ปวดค้าง · PA: periapical radiolucency ที่รากใกล้กลาง",
    a: "Symptomatic irreversible pulpitis with apical periodontitis 36",
    p: "เปิดโพรงประสาทฟัน ทำความสะอาดคลองราก (RCT ครั้งที่ 1) · ใส่ยา Ca(OH)₂ · แจ้งว่าแพ้ Penicillin จ่าย Clindamycin แทน",
  }),
  note("p1", "2026-08-20", [36], {
    s: "ไม่ปวดแล้ว เคี้ยวได้ปกติ",
    o: "36 เคาะไม่เจ็บ เหงือกปกติ · PA หลังอุดคลองราก: อุดได้ความยาวเหมาะสม",
    a: "Previously initiated therapy 36 — healing",
    p: "อุดคลองราก (Obturation) + ครอบฟัน · นัดติดตามผล PA 3 เดือน",
  }),
  note("p2", "2026-10-01", [46, 38], {
    s: "เสียวฟันล่างขวาเวลาดื่มน้ำเย็น · ตั้งครรภ์ 20 สัปดาห์",
    o: "46 ผุด้าน DO ปานกลาง · 38 คุดเอียงตัว (Panoramic)",
    a: "Moderate caries 46DO · Impacted 38 (ยังไม่มีอาการ)",
    p: "อุด Composite 46 DO ในไตรมาสที่ 2 · เลื่อนผ่าฟันคุด 38 ไปหลังคลอด",
  }),
);

// ---------- DICOM writer ----------
const SOP_CLASS = {
  IO: "1.2.840.10008.5.1.4.1.1.1.3", // Digital Intra-Oral X-Ray Image Storage – For Presentation
  PX: "1.2.840.10008.5.1.4.1.1.1.1", // Digital X-Ray Image Storage – For Presentation
};

interface Film {
  key: string;
  patient: Patient;
  date: string; // YYYYMMDD
  modality: "IO" | "PX";
  desc: string;
  filmType: FilmType;
  teeth: number[];
  spacing: number; // mm/px
  image: { w: number; h: number; data: Uint16Array };
}

function toDicom(f: Film): Buffer {
  const studyUid = uid(`${f.patient.id}:${f.date}:study`);
  const seriesUid = uid(`${f.key}:series`);
  const sopUid = uid(`${f.key}:sop`);
  const el = (vr: string, ...Value: unknown[]) => ({ vr, Value });
  const meta = {
    "00020001": el("OB", new Uint8Array([0, 1]).buffer),
    "00020002": el("UI", SOP_CLASS[f.modality]),
    "00020003": el("UI", sopUid),
    "00020010": el("UI", "1.2.840.10008.1.2.1"),
    "00020012": el("UI", "2.25.1234567890"),
    "00020013": el("SH", "DBDENTE_DEMO"),
  };
  const dict = new dcmjs.data.DicomDict(meta);
  const sp = String(f.spacing);
  dict.dict = {
    "00080005": el("CS", "ISO_IR 192"),
    "00080008": el("CS", "ORIGINAL", "PRIMARY"),
    "00080016": el("UI", SOP_CLASS[f.modality]),
    "00080018": el("UI", sopUid),
    "00080020": el("DA", f.date),
    "00080030": el("TM", "100000"),
    "00080060": el("CS", f.modality),
    "00080068": el("CS", "FOR PRESENTATION"),
    "00080070": el("LO", "DBDente Synthetic"),
    "00081030": el("LO", "Dental X-ray"),
    "0008103E": el("LO", f.desc),
    "00100010": el("PN", { Alphabetic: f.patient.fullName }),
    "00100020": el("LO", dicomPatientId(clinic, f.patient)),
    "00100021": el("LO", clinic.code),
    "00100030": el("DA", f.patient.birthDate.replaceAll("-", "")),
    "00100040": el("CS", f.patient.sex),
    "00181164": el("DS", sp, sp), // ImagerPixelSpacing
    "0020000D": el("UI", studyUid),
    "0020000E": el("UI", seriesUid),
    "00200010": el("SH", "1"),
    "00200011": el("IS", "1"),
    "00200013": el("IS", "1"),
    "00200020": el("CS", "L", "F"),
    "00280002": el("US", 1),
    "00280004": el("CS", "MONOCHROME2"),
    "00280010": el("US", f.image.h),
    "00280011": el("US", f.image.w),
    "00280030": el("DS", sp, sp), // PixelSpacing (ใช้วัดระยะ mm)
    "00280100": el("US", 16),
    "00280101": el("US", 12),
    "00280102": el("US", 11),
    "00280103": el("US", 0),
    "00281050": el("DS", "2100"),
    "00281051": el("DS", "3600"),
    "7FE00010": el("OW", f.image.data.buffer),
  };
  return Buffer.from(dict.write());
}

// ---------- films ----------
const [p1, p2] = patients;
const films: Film[] = [
  { key: "p1-pa36-before", patient: p1, date: "20260512", modality: "IO", desc: "PA 36 pre-op", filmType: "PA", teeth: [36], spacing: 0.04, image: pa36("before") },
  { key: "p1-pa36-after", patient: p1, date: "20260820", modality: "IO", desc: "PA 36 post RCT", filmType: "PA", teeth: [36], spacing: 0.04, image: pa36("after") },
  { key: "p1-pa11", patient: p1, date: "20260512", modality: "IO", desc: "PA 11", filmType: "PA", teeth: [11, 12, 21], spacing: 0.04, image: pa11() },
  { key: "p1-bw-r", patient: p1, date: "20260512", modality: "IO", desc: "Bitewing Right", filmType: "BW", teeth: [14, 15, 16, 44, 45, 46], spacing: 0.04, image: bitewingRight() },
  { key: "p1-pano", patient: p1, date: "20251103", modality: "PX", desc: "Panoramic", filmType: "PANO", teeth: [], spacing: 0.1, image: panoramic({ missing: [17], fillings: [26, 37, 15] }) },
  { key: "p2-pano", patient: p2, date: "20261001", modality: "PX", desc: "Panoramic", filmType: "PANO", teeth: [], spacing: 0.1, image: panoramic({ fillings: [16, 36], crowns: [] }) },
];

const images = createImageSource();
if (images.readOnly) {
  console.log(`⚠ ${images.name} อยู่ในโหมดอ่านอย่างเดียว — ไม่ส่งภาพเดโมเข้า PACS (สร้างเฉพาะข้อมูลคลินิก/คนไข้)`);
  console.log("  ผูกคนไข้เดโมกับ PatientID ที่มีใน PACS ด้วย: npm run pacs:check -- --patient <PatientID> --link p1");
} else {
  console.log(`กำลังสร้างภาพ ${films.length} ไฟล์ → ${images.name}`);
}
for (const f of images.readOnly ? [] : films) {
  const buf = toDicom(f);
  const meta = await images.store(buf);
  db.imageLinks[meta.sopInstanceUid] = { sopInstanceUid: meta.sopInstanceUid, patientId: f.patient.id, filmType: f.filmType, teeth: f.teeth };
  fs.mkdirSync(path.join(config.dataDir, "samples"), { recursive: true });
  fs.writeFileSync(path.join(config.dataDir, "samples", `${f.key}.dcm`), buf);
  console.log(`  ✓ ${f.key}  ${f.image.w}x${f.image.h}  ${(buf.byteLength / 1024 / 1024).toFixed(1)} MB`);
}

replaceDb(db);
console.log("เสร็จแล้ว: data/db.json, ไฟล์ตัวอย่างสำหรับทดสอบอัปโหลดอยู่ที่ data/samples/");
