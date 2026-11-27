/**
 * งานหน้าร้าน: ทะเบียนคนไข้ · เก้าอี้ทำฟัน · นัดหมาย · คิววันนี้
 * เวลาทั้งหมดเป็นเวลาท้องถิ่นไทย (Asia/Bangkok) รูปแบบ YYYY-MM-DDTHH:mm
 */
import crypto from "node:crypto";
import type { Express, Response } from "express";
import { requireRole, type AuthedRequest } from "./auth.js";
import { ensureDraft, invoiceForAppointment } from "./billing.js";
import type { Appointment, AppointmentStatus, Chair, ChairStatus, Patient, Role } from "./domain.js";
import { notify } from "./realtime.js";
import { audit, getDb, save } from "./store.js";

const TZ = "Asia/Bangkok";
/** YYYY-MM-DDTHH:mm ตามเวลาไทย */
export const nowLocal = () => new Date().toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 16).replace(" ", "T");
const todayLocal = () => nowLocal().slice(0, 10);
const minutesOf = (start: string) => Number(start.slice(11, 13)) * 60 + Number(start.slice(14, 16));
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const ctx = (req: AuthedRequest) => ({ userId: req.user!.id, clinicId: req.user!.clinicId, ip: req.ip });
const bad = (res: Response, status: number, error: string, extra: object = {}) => void res.status(status).json({ error, ...extra });

/** ชื่อบนจอเรียกคิว: ชื่อจริง + อักษรแรกของนามสกุล (PDPA) */
export function maskName(full: string) {
  const parts = full.replace(/^(ด\.ช\.|ด\.ญ\.|นาย|นาง|นางสาว)\s*/, "").split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
}

// ---------- patients ----------
/** ตรวจเลขบัตรประชาชนไทย 13 หลัก (หลักสุดท้ายคือ checksum) */
export function validCitizenId(id: string) {
  if (!/^\d{13}$/.test(id)) return false;
  const sum = [...id.slice(0, 12)].reduce((s, d, i) => s + Number(d) * (13 - i), 0);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

const strList = (v: unknown, max = 20) =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))].slice(0, max).map((x) => x.slice(0, 100)) : [];

function parsePatient(body: Record<string, unknown>): { ok: Omit<Patient, "id" | "clinicId" | "hn"> } | { error: string; field: string } {
  const fullName = String(body.fullName ?? "").trim().replace(/\s+/g, " ");
  if (fullName.length < 2) return { error: "กรอกชื่อ-นามสกุล", field: "fullName" };
  const birthDate = String(body.birthDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate)) || birthDate > todayLocal())
    return { error: "วันเกิดไม่ถูกต้อง", field: "birthDate" };
  if (body.sex !== "M" && body.sex !== "F") return { error: "เลือกเพศ", field: "sex" };
  const phone = String(body.phone ?? "").replace(/[\s-]/g, "");
  if (phone && !/^0\d{8,9}$/.test(phone)) return { error: "เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0", field: "phone" };
  const citizenId = String(body.citizenId ?? "").replace(/[\s-]/g, "");
  if (citizenId && !validCitizenId(citizenId)) return { error: "เลขบัตรประชาชนไม่ถูกต้อง", field: "citizenId" };
  const ec = (body.emergencyContact ?? {}) as Record<string, unknown>;
  const ecPhone = String(ec.phone ?? "").replace(/[\s-]/g, "");
  if (ecPhone && !/^0\d{8,9}$/.test(ecPhone)) return { error: "เบอร์ผู้ติดต่อฉุกเฉินไม่ถูกต้อง", field: "emergencyPhone" };
  const fmtPhone = (p: string) => (p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p);
  return {
    ok: {
      fullName,
      birthDate,
      sex: body.sex,
      phone: phone ? fmtPhone(phone) : undefined,
      citizenId: citizenId || undefined,
      address: String(body.address ?? "").trim().slice(0, 300) || undefined,
      allergies: strList(body.allergies),
      medicalAlerts: strList(body.medicalAlerts),
      emergencyContact: String(ec.name ?? "").trim()
        ? { name: String(ec.name).trim().slice(0, 100), phone: fmtPhone(ecPhone), relation: String(ec.relation ?? "").trim().slice(0, 50) || undefined }
        : undefined,
    },
  };
}

function nextHn(clinicId: string) {
  const max = getDb()
    .patients.filter((p) => p.clinicId === clinicId)
    .reduce((m, p) => Math.max(m, Number(p.hn.replace(/\D/g, "")) || 0), 0);
  return `HN${String(max + 1).padStart(6, "0")}`;
}

// ---------- appointments ----------
const ACTIVE: AppointmentStatus[] = ["booked", "arrived", "in_room", "awaiting_payment", "done"];

/** showMoney: แนบยอดบิล (เฉพาะเจ้าของ/เคาน์เตอร์) */
function view(a: Appointment, showMoney = false) {
  const db = getDb();
  const p = db.patients.find((x) => x.id === a.patientId);
  const inv = showMoney ? invoiceForAppointment(a.id) : undefined;
  return {
    invoice: inv && { id: inv.id, status: inv.status, total: inv.total, receiptNo: inv.receiptNo },
    ...a,
    end: `${a.start.slice(0, 11)}${hhmm(minutesOf(a.start) + a.durationMin)}`,
    patient: p && {
      id: p.id,
      hn: p.hn,
      fullName: p.fullName,
      allergies: p.allergies,
      medicalAlerts: p.medicalAlerts,
    },
    dentistName: db.users.find((u) => u.id === a.dentistId)?.name,
    chairName: db.chairs.find((c) => c.id === a.chairId)?.name,
  };
}

/** หานัดที่ชนกัน (เก้าอี้เดียวกัน หรือหมอคนเดียวกัน เวลาทับกัน) */
function conflict(a: Pick<Appointment, "id" | "clinicId" | "start" | "durationMin" | "dentistId" | "chairId">) {
  const s = minutesOf(a.start);
  const e = s + a.durationMin;
  const db = getDb();
  for (const b of db.appointments) {
    if (b.id === a.id || b.clinicId !== a.clinicId || !ACTIVE.includes(b.status) || b.start.slice(0, 10) !== a.start.slice(0, 10)) continue;
    const bs = minutesOf(b.start);
    if (bs >= e || bs + b.durationMin <= s) continue;
    const who = db.patients.find((p) => p.id === b.patientId)?.fullName ?? "";
    const when = `${hhmm(bs)}–${hhmm(bs + b.durationMin)}`;
    if (a.chairId && b.chairId === a.chairId)
      return `${db.chairs.find((c) => c.id === a.chairId)?.name} มีนัดแล้วช่วง ${when} (${who})`;
    if (b.dentistId === a.dentistId) return `${db.users.find((u) => u.id === a.dentistId)?.name} มีนัดแล้วช่วง ${when} (${who})`;
  }
  return null;
}

function parseAppointment(req: AuthedRequest, base?: Appointment) {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const db = getDb();
  const clinicId = req.user!.clinicId;
  const patientId = String(body.patientId ?? base?.patientId ?? "");
  if (!db.patients.some((p) => p.id === patientId && p.clinicId === clinicId)) return { error: "เลือกคนไข้" };
  const dentistId = String(body.dentistId ?? base?.dentistId ?? "");
  if (!db.users.some((u) => u.id === dentistId && u.clinicId === clinicId && (u.role === "dentist" || u.role === "owner")))
    return { error: "เลือกทันตแพทย์" };
  const chairId = body.chairId === undefined ? base?.chairId : String(body.chairId || "") || undefined;
  if (chairId && !db.chairs.some((c) => c.id === chairId && c.clinicId === clinicId)) return { error: "ไม่พบเก้าอี้" };
  const start = String(body.start ?? base?.start ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start) || minutesOf(start) % 5) return { error: "เวลานัดไม่ถูกต้อง" };
  const durationMin = Number(body.durationMin ?? base?.durationMin ?? 30);
  if (!Number.isInteger(durationMin) || durationMin < 10 || durationMin > 480 || durationMin % 5) return { error: "ระยะเวลาต้องเป็น 10–480 นาที" };
  const procedure = String(body.procedure ?? base?.procedure ?? "").trim().slice(0, 200);
  if (!procedure) return { error: "ระบุหัตถการ" };
  const note = body.note === undefined ? base?.note : String(body.note).trim().slice(0, 500) || undefined;
  return { ok: { patientId, dentistId, chairId, start, durationMin, procedure, note } };
}

function nextQueueNo(clinicId: string, date: string) {
  const n = getDb().appointments.filter((a) => a.clinicId === clinicId && a.start.startsWith(date) && a.queueNo).length;
  return `A${String(n + 1).padStart(3, "0")}`;
}

/** การเปลี่ยนสถานะที่อนุญาต และบทบาทที่ทำได้ */
const TRANSITIONS: Record<string, Role[]> = {
  "booked>arrived": ["owner", "receptionist", "assistant"],
  "booked>cancelled": ["owner", "receptionist"],
  "booked>no_show": ["owner", "receptionist"],
  "arrived>cancelled": ["owner", "receptionist"],
  "arrived>in_room": ["owner", "dentist", "receptionist", "assistant"],
  "in_room>awaiting_payment": ["owner", "dentist", "receptionist", "assistant"],
  // awaiting_payment → done เกิดจากการรับชำระในหน้าการเงินเท่านั้น
};

function setChair(chair: Chair | undefined, status: ChairStatus) {
  if (!chair) return;
  chair.status = status;
  chair.updatedAt = new Date().toISOString();
}

export function registerClinicRoutes(app: Express) {
  // ----- staff / chairs -----
  app.get("/api/staff/dentists", (req: AuthedRequest, res) => {
    res.json(
      getDb()
        .users.filter((u) => u.clinicId === req.user!.clinicId && (u.role === "dentist" || u.role === "owner"))
        .map((u) => ({ id: u.id, name: u.name })),
    );
  });

  app.get("/api/chairs", (req: AuthedRequest, res) => {
    res.json(getDb().chairs.filter((c) => c.clinicId === req.user!.clinicId));
  });

  app.put("/api/chairs/:id", requireRole("owner", "receptionist", "assistant"), (req: AuthedRequest, res) => {
    const chair = getDb().chairs.find((c) => c.id === req.params.id && c.clinicId === req.user!.clinicId);
    if (!chair) return bad(res, 404, "ไม่พบเก้าอี้");
    const status = req.body?.status as ChairStatus;
    if (!["available", "preparing", "in_use", "maintenance"].includes(status)) return bad(res, 400, "สถานะไม่ถูกต้อง");
    const occupied = getDb().appointments.some((a) => a.chairId === chair.id && a.status === "in_room");
    if (occupied && status !== "in_use") return bad(res, 409, `${chair.name} มีคนไข้อยู่ในห้อง`);
    setChair(chair, status);
    save();
    audit({ ...ctx(req), action: "CHAIR_STATUS", target: `${chair.id}:${status}` });
    notify(chair.clinicId, { type: "queue:changed" });
    res.json(chair);
  });

  // ----- patients -----
  app.post("/api/patients", requireRole("owner", "receptionist"), (req: AuthedRequest, res) => {
    const r = parsePatient(req.body ?? {});
    if ("error" in r) return bad(res, 400, r.error, { field: r.field });
    const db = getDb();
    const clinicId = req.user!.clinicId;
    const dup = db.patients.find(
      (p) =>
        p.clinicId === clinicId &&
        ((r.ok.citizenId && p.citizenId === r.ok.citizenId) || (p.fullName === r.ok.fullName && p.birthDate === r.ok.birthDate)),
    );
    if (dup) return bad(res, 409, `มีคนไข้นี้ในระบบแล้ว (${dup.hn} ${dup.fullName})`, { existingId: dup.id });
    const p: Patient = { id: `p${crypto.randomUUID().slice(0, 8)}`, clinicId, hn: nextHn(clinicId), ...r.ok, createdAt: new Date().toISOString() };
    db.patients.push(p);
    save();
    audit({ ...ctx(req), action: "CREATE_PATIENT", patientId: p.id });
    res.status(201).json(p);
  });

  app.put("/api/patients/:patientId", requireRole("owner", "receptionist"), (req: AuthedRequest, res) => {
    const db = getDb();
    const p = db.patients.find((x) => x.id === req.params.patientId && x.clinicId === req.user!.clinicId);
    if (!p) return bad(res, 404, "ไม่พบคนไข้");
    const r = parsePatient(req.body ?? {});
    if ("error" in r) return bad(res, 400, r.error, { field: r.field });
    const dup = r.ok.citizenId && db.patients.find((x) => x.id !== p.id && x.clinicId === p.clinicId && x.citizenId === r.ok.citizenId);
    if (dup) return bad(res, 409, `เลขบัตรนี้เป็นของ ${dup.hn} ${dup.fullName}`, { existingId: dup.id });
    Object.assign(p, r.ok);
    save();
    audit({ ...ctx(req), action: "UPDATE_PATIENT", patientId: p.id });
    res.json(p);
  });

  // ----- appointments -----
  /** จอเรียกคิว: เฉพาะเลขคิว ห้อง และชื่อแบบปิดบัง — ไม่ส่งข้อมูลอื่นของคนไข้ไปจอสาธารณะ */
  app.get("/api/queue/display", (req: AuthedRequest, res) => {
    const db = getDb();
    const today = todayLocal();
    res.json(
      db.appointments
        .filter((a) => a.clinicId === req.user!.clinicId && a.start.startsWith(today) && a.queueNo && ["arrived", "in_room"].includes(a.status))
        .sort((a, b) => (a.calledAt ?? a.arrivedAt ?? "").localeCompare(b.calledAt ?? b.arrivedAt ?? ""))
        .map((a) => ({
          queueNo: a.queueNo,
          status: a.status,
          chairName: db.chairs.find((c) => c.id === a.chairId)?.name,
          maskedName: maskName(db.patients.find((p) => p.id === a.patientId)?.fullName ?? ""),
          calledAt: a.calledAt,
        })),
    );
  });

  app.get("/api/appointments", (req: AuthedRequest, res) => {
    const money = req.user!.role === "owner" || req.user!.role === "receptionist";
    const v = (a: Appointment) => view(a, money);
    // นัดทั้งหมดของคนไข้รายเดียว (แฟ้มคนไข้)
    if (req.query.patientId) {
      return void res.json(
        getDb()
          .appointments.filter((a) => a.clinicId === req.user!.clinicId && a.patientId === req.query.patientId)
          .sort((a, b) => b.start.localeCompare(a.start))
          .map(v),
      );
    }
    const date = String(req.query.date ?? todayLocal());
    const days = Math.min(Number(req.query.days ?? 1) || 1, 31);
    const to = new Date(`${date}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + days);
    const end = to.toISOString().slice(0, 10);
    res.json(
      getDb()
        .appointments.filter((a) => a.clinicId === req.user!.clinicId && a.start >= date && a.start < end)
        .sort((a, b) => a.start.localeCompare(b.start))
        .map(v),
    );
  });

  app.post("/api/appointments", requireRole("owner", "receptionist"), (req: AuthedRequest, res) => {
    const r = parseAppointment(req);
    if ("error" in r) return bad(res, 400, r.error!);
    const now = new Date().toISOString();
    const a: Appointment = {
      id: crypto.randomUUID(),
      clinicId: req.user!.clinicId,
      ...r.ok!,
      status: "booked",
      createdBy: req.user!.id,
      createdAt: now,
      updatedAt: now,
    };
    const c = conflict(a);
    if (c) return bad(res, 409, c);
    getDb().appointments.push(a);
    save();
    audit({ ...ctx(req), action: "CREATE_APPOINTMENT", patientId: a.patientId, target: a.id });
    notify(a.clinicId, { type: "queue:changed" });
    res.status(201).json(view(a));
  });

  app.put("/api/appointments/:id", requireRole("owner", "receptionist"), (req: AuthedRequest, res) => {
    const a = getDb().appointments.find((x) => x.id === req.params.id && x.clinicId === req.user!.clinicId);
    if (!a) return bad(res, 404, "ไม่พบนัด");
    if (!["booked", "arrived"].includes(a.status)) return bad(res, 409, "นัดนี้เริ่มรักษาแล้ว แก้ไขไม่ได้");
    const r = parseAppointment(req, a);
    if ("error" in r) return bad(res, 400, r.error!);
    if (a.status === "arrived" && r.ok!.start !== a.start) return bad(res, 409, "คนไข้มาถึงแล้ว ย้ายเวลาไม่ได้");
    const next = { ...a, ...r.ok! };
    const c = conflict(next);
    if (c) return bad(res, 409, c);
    Object.assign(a, r.ok, { updatedAt: new Date().toISOString() });
    save();
    audit({ ...ctx(req), action: "UPDATE_APPOINTMENT", patientId: a.patientId, target: a.id });
    notify(a.clinicId, { type: "queue:changed" });
    res.json(view(a));
  });

  app.post("/api/appointments/:id/status", (req: AuthedRequest, res) => {
    const db = getDb();
    const a = db.appointments.find((x) => x.id === req.params.id && x.clinicId === req.user!.clinicId);
    if (!a) return bad(res, 404, "ไม่พบนัด");
    const to = String(req.body?.status ?? "") as AppointmentStatus;
    const roles = TRANSITIONS[`${a.status}>${to}`];
    if (!roles) return bad(res, 409, "เปลี่ยนสถานะนี้ไม่ได้");
    if (!roles.includes(req.user!.role)) return bad(res, 403, "บทบาทนี้เปลี่ยนสถานะนี้ไม่ได้");
    const now = new Date().toISOString();

    if (to === "arrived") {
      a.arrivedAt = now;
      a.queueNo ??= nextQueueNo(a.clinicId, a.start.slice(0, 10));
    }
    if (to === "in_room") {
      const chairId = String(req.body?.chairId ?? a.chairId ?? "");
      const chair = db.chairs.find((c) => c.id === chairId && c.clinicId === a.clinicId);
      if (!chair) return bad(res, 400, "เลือกเก้าอี้");
      if (chair.status === "maintenance") return bad(res, 409, `${chair.name} ปิดซ่อมอยู่`);
      const busy = db.appointments.find((x) => x.chairId === chair.id && x.status === "in_room");
      if (busy) return bad(res, 409, `${chair.name} มีคนไข้อยู่ในห้อง`);
      a.chairId = chair.id;
      a.calledAt = now;
      setChair(chair, "in_use");
    }
    if (to === "awaiting_payment") {
      a.finishedAt = now;
      setChair(db.chairs.find((c) => c.id === a.chairId), "preparing"); // ผู้ช่วยทำความสะอาด/เตรียมห้องต่อ
      ensureDraft(a, req.user!.id); // เปิดบิลร่างจากหัตถการที่ทำเสร็จ ให้เคาน์เตอร์รับชำระต่อ
    }
    a.status = to;
    a.updatedAt = now;
    save();
    audit({ ...ctx(req), action: "QUEUE_STATUS", patientId: a.patientId, target: `${a.id}:${to}` });
    notify(a.clinicId, { type: "queue:changed" });
    if (to === "awaiting_payment") notify(a.clinicId, { type: "billing:changed" });
    if (to === "in_room") callOut(a);
    res.json(view(a));
  });

  /** เรียกคิวซ้ำบนจอ */
  app.post("/api/appointments/:id/recall", requireRole("owner", "receptionist", "assistant", "dentist"), (req: AuthedRequest, res) => {
    const a = getDb().appointments.find((x) => x.id === req.params.id && x.clinicId === req.user!.clinicId);
    if (!a || a.status !== "in_room") return bad(res, 409, "เรียกซ้ำได้เฉพาะคิวที่อยู่ในห้องตรวจ");
    callOut(a);
    res.json({ ok: true });
  });

  app.post("/api/queue/walk-in", requireRole("owner", "receptionist"), (req: AuthedRequest, res) => {
    const n = nowLocal();
    const start = `${n.slice(0, 14)}${String(Math.floor(Number(n.slice(14, 16)) / 5) * 5).padStart(2, "0")}`;
    req.body = { durationMin: 30, ...req.body, start, chairId: req.body?.chairId || undefined };
    const r = parseAppointment(req);
    if ("error" in r) return bad(res, 400, r.error!);
    const now = new Date().toISOString();
    const a: Appointment = {
      id: crypto.randomUUID(),
      clinicId: req.user!.clinicId,
      ...r.ok!,
      status: "arrived",
      walkIn: true,
      arrivedAt: now,
      queueNo: nextQueueNo(req.user!.clinicId, start.slice(0, 10)),
      createdBy: req.user!.id,
      createdAt: now,
      updatedAt: now,
    };
    getDb().appointments.push(a);
    save();
    audit({ ...ctx(req), action: "CREATE_APPOINTMENT", patientId: a.patientId, target: `${a.id}:walk-in` });
    notify(a.clinicId, { type: "queue:changed" });
    res.status(201).json(view(a));
  });
}

function callOut(a: Appointment) {
  const db = getDb();
  notify(a.clinicId, {
    type: "queue:call",
    queueNo: a.queueNo ?? "",
    chairName: db.chairs.find((c) => c.id === a.chairId)?.name ?? "",
    maskedName: maskName(db.patients.find((p) => p.id === a.patientId)?.fullName ?? ""),
  });
}
