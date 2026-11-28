/**
 * งานแล็บ (Phase 3): ส่งงาน → รับกลับ → ใส่ให้คนไข้ · เตือนงานใกล้/เลยกำหนด
 * ค่าแล็บผูกกับรายการในบิลได้ → ถูกหักก่อนคิด DF
 */
import crypto from "node:crypto";
import type { Express, Response } from "express";
import { requireRole, type AuthedRequest } from "./auth.js";
import { validTooth } from "./billing.js";
import type { LabCase, LabStatus } from "./domain.js";
import { audit, getDb, save } from "./store.js";

const TZ = "Asia/Bangkok";
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const ctx = (req: AuthedRequest) => ({ userId: req.user!.id, clinicId: req.user!.clinicId, ip: req.ip });
const bad = (res: Response, status: number, error: string) => void res.status(status).json({ error });
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export const DUE_SOON_DAYS = 2;
const ROLES = ["owner", "dentist", "receptionist"] as const;

/** เปลี่ยนสถานะได้ตามลำดับนี้เท่านั้น */
const NEXT: Record<LabStatus, LabStatus[]> = {
  sent: ["received", "cancelled"],
  received: ["fitted", "remake"],
  remake: ["received", "cancelled"],
  fitted: [],
  cancelled: [],
};

function view(c: LabCase) {
  const db = getDb();
  const t = today();
  const open = c.status === "sent" || c.status === "remake";
  const p = db.patients.find((x) => x.id === c.patientId);
  const inv = c.invoiceId ? db.invoices.find((i) => i.id === c.invoiceId) : undefined;
  return {
    ...c,
    patient: p && { id: p.id, hn: p.hn, fullName: p.fullName },
    dentistName: db.users.find((u) => u.id === c.dentistId)?.name,
    labName: db.labs.find((l) => l.id === c.labId)?.name,
    linkedItem: inv?.items.find((i) => i.id === c.invoiceItemId)?.name,
    linkedReceipt: inv?.receiptNo,
    overdue: open && c.dueDate < t,
    dueSoon: open && c.dueDate >= t && c.dueDate <= addDays(t, DUE_SOON_DAYS),
  };
}

function parse(req: AuthedRequest, base?: LabCase): { ok: Partial<LabCase> } | { error: string } {
  const db = getDb();
  const clinicId = req.user!.clinicId;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const pick = <K extends keyof LabCase>(k: K) => (b[k] === undefined ? base?.[k] : b[k]);
  const patientId = String(pick("patientId") ?? "");
  if (!db.patients.some((p) => p.id === patientId && p.clinicId === clinicId)) return { error: "เลือกคนไข้" };
  const dentistId = String(pick("dentistId") ?? "");
  if (!db.users.some((u) => u.id === dentistId && u.clinicId === clinicId && (u.role === "dentist" || u.role === "owner"))) return { error: "เลือกทันตแพทย์" };
  const labId = String(pick("labId") ?? "");
  if (!db.labs.some((l) => l.id === labId && l.clinicId === clinicId && (l.active !== false || labId === base?.labId))) return { error: "เลือกแล็บ" };
  const work = String(pick("work") ?? "").trim().slice(0, 120);
  if (!work) return { error: "ระบุงาน เช่น ครอบฟัน PFM" };
  const teeth = Array.isArray(pick("teeth")) ? [...new Set((pick("teeth") as unknown[]).map(Number))] : [];
  if (teeth.length > 32 || !teeth.every((t) => Number.isInteger(t) && validTooth(t))) return { error: "เลขซี่ไม่ถูกต้อง" };
  const sentAt = pick("sentAt") ?? today();
  const dueDate = pick("dueDate");
  if (!isDate(sentAt) || !isDate(dueDate)) return { error: "วันที่ส่ง/วันนัดรับไม่ถูกต้อง" };
  if (dueDate < sentAt) return { error: "วันนัดรับต้องไม่ก่อนวันที่ส่ง" };
  const cost = Number(pick("cost") ?? 0);
  if (!Number.isInteger(cost) || cost < 0 || cost > 100_000_000) return { error: "ค่าแล็บไม่ถูกต้อง" };
  // ผูกกับรายการในบิลของคนไข้รายเดียวกัน
  let invoiceId: string | undefined;
  const invoiceItemId = b.invoiceItemId === undefined ? base?.invoiceItemId : String(b.invoiceItemId || "") || undefined;
  if (invoiceItemId) {
    const inv = db.invoices.find((i) => i.clinicId === clinicId && i.patientId === patientId && i.status !== "void" && i.items.some((x) => x.id === invoiceItemId));
    if (!inv) return { error: "ไม่พบรายการบิลของคนไข้รายนี้" };
    invoiceId = inv.id;
  }
  return {
    ok: {
      patientId,
      dentistId,
      labId,
      work,
      teeth,
      shade: String(pick("shade") ?? "").trim().slice(0, 20) || undefined,
      sentAt,
      dueDate,
      cost,
      invoiceId,
      invoiceItemId,
      note: String(pick("note") ?? "").trim().slice(0, 500) || undefined,
    },
  };
}

export function registerLabRoutes(app: Express) {
  app.get("/api/labs", requireRole(...ROLES), (req: AuthedRequest, res) => {
    res.json(getDb().labs.filter((l) => l.clinicId === req.user!.clinicId && l.active !== false));
  });

  /** ทันตแพทย์เห็นเฉพาะงานของตัวเอง */
  app.get("/api/lab-cases", requireRole(...ROLES), (req: AuthedRequest, res) => {
    const u = req.user!;
    res.json(
      getDb()
        .labCases.filter((c) => c.clinicId === u.clinicId && (u.role !== "dentist" || c.dentistId === u.id))
        .filter((c) => !req.query.patientId || c.patientId === req.query.patientId)
        .map(view)
        .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.dueDate.localeCompare(b.dueDate)),
    );
  });

  /** รายการบิลของคนไข้ (สำหรับเลือกผูกค่าแล็บ) */
  app.get("/api/lab-cases/billable", requireRole("owner", "receptionist", "dentist"), (req: AuthedRequest, res) => {
    const pid = String(req.query.patientId ?? "");
    res.json(
      getDb()
        .invoices.filter((i) => i.clinicId === req.user!.clinicId && i.patientId === pid && i.status !== "void" && i.kind !== "deposit")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 10)
        .flatMap((i) => i.items.map((x) => ({ itemId: x.id, name: x.name, teeth: x.teeth, receiptNo: i.receiptNo, date: (i.paidAt ?? i.createdAt).slice(0, 10) }))),
    );
  });

  app.post("/api/lab-cases", requireRole(...ROLES), (req: AuthedRequest, res) => {
    const r = parse(req);
    if ("error" in r) return bad(res, 400, r.error);
    const now = new Date().toISOString();
    const c = { id: crypto.randomUUID(), clinicId: req.user!.clinicId, status: "sent", createdBy: req.user!.id, createdAt: now, updatedAt: now, ...r.ok } as LabCase;
    getDb().labCases.push(c);
    save();
    audit({ ...ctx(req), action: "LAB_CASE", patientId: c.patientId, target: `${c.id}:create` });
    res.status(201).json(view(c));
  });

  const find = (req: AuthedRequest) => {
    const u = req.user!;
    return getDb().labCases.find((c) => c.id === req.params.id && c.clinicId === u.clinicId && (u.role !== "dentist" || c.dentistId === u.id));
  };

  app.put("/api/lab-cases/:id", requireRole(...ROLES), (req: AuthedRequest, res) => {
    const c = find(req);
    if (!c) return bad(res, 404, "ไม่พบงานแล็บ");
    if (c.status === "fitted" || c.status === "cancelled") return bad(res, 409, "งานนี้ปิดแล้ว แก้ไขไม่ได้");
    const r = parse(req, c);
    if ("error" in r) return bad(res, 400, r.error);
    Object.assign(c, r.ok, { updatedAt: new Date().toISOString() });
    save();
    audit({ ...ctx(req), action: "LAB_CASE", patientId: c.patientId, target: `${c.id}:update` });
    res.json(view(c));
  });

  app.post("/api/lab-cases/:id/status", requireRole(...ROLES), (req: AuthedRequest, res) => {
    const c = find(req);
    if (!c) return bad(res, 404, "ไม่พบงานแล็บ");
    const to = req.body?.status as LabStatus;
    if (!NEXT[c.status]?.includes(to)) return bad(res, 409, "เปลี่ยนสถานะนี้ไม่ได้");
    const t = today();
    if (to === "received") c.receivedAt = t;
    if (to === "fitted") c.fittedAt = t;
    if (to === "remake") {
      if (!isDate(req.body?.dueDate) || req.body.dueDate < t) return bad(res, 400, "ระบุวันนัดรับงานแก้");
      c.dueDate = req.body.dueDate;
      c.receivedAt = undefined;
      c.note = [c.note, `ส่งแก้ ${t}: ${String(req.body?.reason ?? "").slice(0, 200)}`].filter(Boolean).join(" · ");
    }
    c.status = to;
    c.updatedAt = new Date().toISOString();
    save();
    audit({ ...ctx(req), action: "LAB_CASE", patientId: c.patientId, target: `${c.id}:${to}` });
    res.json(view(c));
  });
}
