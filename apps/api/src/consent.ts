/**
 * E-Consent: สร้างเอกสารจากเทมเพลต → ส่งไปแท็บเล็ต (Kiosk) → คนไข้ติ๊กยินยอม + เซ็น → ล็อกเอกสาร
 * เอกสารที่เซ็นแล้วแก้ไม่ได้ และเก็บ hash ไว้ตรวจว่าไม่ถูกแก้ภายหลัง
 */
import crypto from "node:crypto";
import type { Express, Response } from "express";
import { requireRole, type AuthedRequest } from "./auth.js";
import { validTooth } from "./billing.js";
import type { Consent, Patient } from "./domain.js";
import { notify } from "./realtime.js";
import { audit, getDb, save } from "./store.js";

const ctx = (req: AuthedRequest) => ({ userId: req.user!.id, clinicId: req.user!.clinicId, ip: req.ip });
const bad = (res: Response, status: number, error: string) => void res.status(status).json({ error });

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const MAX_SIGNATURE = 400_000; // ความยาว data URL (~300 KB)

/** เนื้อหาที่นำไปคำนวณ hash — ต้องเรียงลำดับคงที่ */
export const consentHash = (c: Consent) =>
  sha256(
    JSON.stringify([c.id, c.patientId, c.title, c.procedure, c.teeth, c.body, c.checks, c.accepted, c.signerName, c.signerRelation, c.signature, c.signedAt]),
  );

const userName = (id?: string) => (id ? getDb().users.find((u) => u.id === id)?.name : undefined);

function view(c: Consent, withSignature = false) {
  const db = getDb();
  const p = db.patients.find((x) => x.id === c.patientId);
  const { signature, ...rest } = c;
  return {
    ...rest,
    ...(withSignature ? { signature } : {}),
    patient: p && { id: p.id, hn: p.hn, fullName: p.fullName, birthDate: p.birthDate },
    dentistName: userName(c.dentistId),
    createdByName: userName(c.createdBy),
    clinicName: db.clinics.find((x) => x.id === c.clinicId)?.name,
    verified: c.status === "signed" ? c.hash === consentHash(c) : undefined,
  };
}

const fill = (text: string, v: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);

// กัน brute-force PIN ออกจาก Kiosk: ผิด 5 ครั้งใน 5 นาที → ล็อก
const pinFails = new Map<string, number[]>();

export function registerConsentRoutes(app: Express) {
  app.get("/api/consent-templates", (req: AuthedRequest, res) => {
    res.json(getDb().consentTemplates.filter((t) => t.clinicId === req.user!.clinicId));
  });

  const patientOf = (req: AuthedRequest): Patient | undefined =>
    getDb().patients.find((p) => p.id === req.params.patientId && p.clinicId === req.user!.clinicId);

  app.get("/api/patients/:patientId/consents", (req: AuthedRequest, res) => {
    const p = patientOf(req);
    if (!p) return bad(res, 404, "ไม่พบคนไข้");
    res.json(
      getDb()
        .consents.filter((c) => c.patientId === p.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((c) => view(c)),
    );
  });

  app.post("/api/patients/:patientId/consents", requireRole("owner", "dentist", "receptionist", "assistant"), (req: AuthedRequest, res) => {
    const db = getDb();
    const p = patientOf(req);
    if (!p) return bad(res, 404, "ไม่พบคนไข้");
    const t = db.consentTemplates.find((x) => x.id === req.body?.templateId && x.clinicId === p.clinicId);
    if (!t) return bad(res, 400, "เลือกเอกสาร");
    const dentist = db.users.find((u) => u.id === req.body?.dentistId && u.clinicId === p.clinicId && (u.role === "dentist" || u.role === "owner"));
    if (!dentist) return bad(res, 400, "เลือกทันตแพทย์ผู้อธิบาย");
    const procedure = String(req.body?.procedure ?? "").trim().slice(0, 200);
    const teeth = Array.isArray(req.body?.teeth) ? [...new Set((req.body.teeth as unknown[]).map(Number))] : [];
    if (teeth.length > 32 || !teeth.every((x) => Number.isInteger(x) && validTooth(x))) return bad(res, 400, "เลขซี่ไม่ถูกต้อง");
    const clinic = db.clinics.find((c) => c.id === p.clinicId)!;
    const vars = {
      patient: p.fullName,
      procedure: procedure || "ตามที่ทันตแพทย์อธิบาย",
      teeth: teeth.length ? `ซี่ ${teeth.join(", ")}` : "",
      dentist: dentist.name,
      clinic: clinic.name,
    };
    const c: Consent = {
      id: crypto.randomUUID(),
      clinicId: p.clinicId,
      patientId: p.id,
      templateId: t.id,
      title: t.title,
      procedure,
      teeth,
      dentistId: dentist.id,
      body: t.body.map((b) => fill(b, vars).replace(/\s+/g, " ").trim()),
      checks: structuredClone(t.checks),
      status: "pending",
      createdBy: req.user!.id,
      createdAt: new Date().toISOString(),
    };
    db.consents.push(c);
    save();
    audit({ ...ctx(req), action: "CREATE_CONSENT", patientId: p.id, target: c.id });
    notify(p.clinicId, { type: "consent:changed", patientId: p.id });
    res.status(201).json(view(c));
  });

  const find = (req: AuthedRequest) => getDb().consents.find((c) => c.id === req.params.id && c.clinicId === req.user!.clinicId);

  app.get("/api/consents/:id", (req: AuthedRequest, res) => {
    const c = find(req);
    if (!c) return bad(res, 404, "ไม่พบเอกสาร");
    if (c.status === "signed") audit({ ...ctx(req), action: "VIEW_CONSENT", patientId: c.patientId, target: c.id });
    res.json(view(c, true));
  });

  /** ส่งไปเปิดบนแท็บเล็ตของคลินิก */
  app.post("/api/consents/:id/push", (req: AuthedRequest, res) => {
    const c = find(req);
    if (!c) return bad(res, 404, "ไม่พบเอกสาร");
    if (c.status !== "pending") return bad(res, 409, "เอกสารนี้ไม่ได้รอเซ็น");
    notify(c.clinicId, { type: "kiosk:open", consentId: c.id });
    res.json({ ok: true });
  });

  app.post("/api/consents/:id/cancel", requireRole("owner", "dentist", "receptionist", "assistant"), (req: AuthedRequest, res) => {
    const c = find(req);
    if (!c) return bad(res, 404, "ไม่พบเอกสาร");
    if (c.status !== "pending") return bad(res, 409, "ยกเลิกได้เฉพาะเอกสารที่ยังไม่เซ็น");
    c.status = "cancelled";
    save();
    audit({ ...ctx(req), action: "CANCEL_CONSENT", patientId: c.patientId, target: c.id });
    notify(c.clinicId, { type: "consent:changed", patientId: c.patientId });
    res.json(view(c));
  });

  /** คนไข้เซ็นบนแท็บเล็ต */
  app.post("/api/consents/:id/sign", (req: AuthedRequest, res) => {
    const c = find(req);
    if (!c) return bad(res, 404, "ไม่พบเอกสาร");
    if (c.status !== "pending") return bad(res, 409, c.status === "signed" ? "เอกสารนี้เซ็นแล้ว" : "เอกสารนี้ถูกยกเลิกแล้ว");
    const raw = (req.body?.accepted ?? {}) as Record<string, unknown>;
    const accepted = Object.fromEntries(c.checks.map((k) => [k.id, raw[k.id] === true]));
    const missing = c.checks.find((k) => k.required && !accepted[k.id]);
    if (missing) return bad(res, 400, `ต้องยินยอม: ${missing.label}`);
    const signature = String(req.body?.signature ?? "");
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length > MAX_SIGNATURE) return bad(res, 400, "กรุณาเซ็นชื่อ");
    const relation = req.body?.signerRelation ?? "self";
    if (!["self", "parent", "guardian"].includes(relation)) return bad(res, 400, "ระบุผู้ลงนาม");
    const patient = getDb().patients.find((p) => p.id === c.patientId)!;
    const signerName = relation === "self" ? patient.fullName : String(req.body?.signerName ?? "").trim().slice(0, 100);
    if (!signerName) return bad(res, 400, "กรอกชื่อผู้ลงนามแทน");

    Object.assign(c, { accepted, signature, signerName, signerRelation: relation, signedAt: new Date().toISOString(), status: "signed" });
    c.hash = consentHash(c);
    save();
    audit({ ...ctx(req), action: "SIGN_CONSENT", patientId: c.patientId, target: `${c.id}:${c.hash.slice(0, 12)}` });
    notify(c.clinicId, { type: "consent:changed", patientId: c.patientId });
    res.json({ ok: true, signedAt: c.signedAt });
  });

  /** ออกจากโหมด Kiosk ต้องใช้ PIN พนักงาน */
  app.post("/api/kiosk/unlock", (req: AuthedRequest, res) => {
    const key = `${req.user!.id}:${req.ip}`;
    const now = Date.now();
    const recent = (pinFails.get(key) ?? []).filter((t) => now - t < 5 * 60_000);
    if (recent.length >= 5) return bad(res, 429, "ใส่ PIN ผิดหลายครั้ง รอ 5 นาที");
    const clinic = getDb().clinics.find((c) => c.id === req.user!.clinicId);
    const pin = String(req.body?.pin ?? "");
    if (!clinic?.kioskPinHash || !/^\d{4,8}$/.test(pin) || sha256(pin) !== clinic.kioskPinHash) {
      pinFails.set(key, [...recent, now]);
      return bad(res, 403, "PIN ไม่ถูกต้อง"); // ไม่ใช้ 401 — เว็บถือว่า 401 คือ session หมดอายุแล้วจะ logout แท็บเล็ต
    }
    pinFails.delete(key);
    audit({ ...ctx(req), action: "KIOSK_UNLOCK" });
    res.json({ ok: true });
  });
}
