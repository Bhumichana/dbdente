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
import { dicomPatientId, type Clinic, type Db, type FilmType, type Patient, type ToothRecord } from "../src/domain.js";
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

const clinic: Clinic = { id: "c1", code: "DEMO01", name: "คลินิกทันตกรรมยิ้มสวย (เดโม)" };

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
};

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
