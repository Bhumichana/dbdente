/**
 * มัดจำ + แผนผ่อนชำระ (Phase 2)
 * - รับมัดจำ = บิลชนิด deposit (ออกใบเสร็จ/ปิดยอดตามปกติ) · ใช้มัดจำจ่ายบิลอื่นด้วยช่องทาง "deposit"
 * - แผนผ่อน: ตารางงวดคำนวณจากแผน · กด "ออกบิลงวด" → บิลร่างไปรับชำระที่หน้าการเงิน
 */
import crypto from "node:crypto";
import type { Express, Response } from "express";
import { requireRole, type AuthedRequest } from "./auth.js";
import { depositBalance } from "./billing.js";
import type { InstallmentPlan, Invoice } from "./domain.js";
import { notify } from "./realtime.js";
import { audit, getDb, save } from "./store.js";

const TZ = "Asia/Bangkok";
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const ctx = (req: AuthedRequest) => ({ userId: req.user!.id, clinicId: req.user!.clinicId, ip: req.ip });
const bad = (res: Response, status: number, error: string) => void res.status(status).json({ error });
const FRONT = ["owner", "receptionist"] as const;
const MAX = 100_000_000;

/** + n เดือน (วันที่เกินเดือนสั้นจะถูกปัดเป็นวันสุดท้ายของเดือน) */
export function addMonths(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

export type RowStatus = "paid" | "billed" | "overdue" | "due" | "upcoming";

/** ตารางงวด: งวด 0 = เงินดาวน์ (ถ้ามี) · ยอดต่องวดปัดลงเป็นบาท เศษไปอยู่งวดสุดท้าย */
export function schedule(plan: InstallmentPlan) {
  const db = getDb();
  const t = today();
  const base = plan.total - plan.downPayment;
  const per = Math.floor(base / plan.count / 100) * 100;
  const invs = db.invoices.filter((i) => i.planId === plan.id && i.status !== "void");
  const rows = [
    ...(plan.downPayment > 0 ? [{ no: 0, due: plan.createdAt.slice(0, 10), amount: plan.downPayment }] : []),
    ...Array.from({ length: plan.count }, (_, k) => ({
      no: k + 1,
      due: addMonths(plan.firstDue, k),
      amount: k + 1 < plan.count ? per : base - per * (plan.count - 1),
    })),
  ];
  return rows.map((r) => {
    const inv = invs.find((i) => i.installmentNo === r.no);
    const status: RowStatus =
      inv?.status === "paid" ? "paid" : inv ? "billed" : r.due < t ? "overdue" : r.due === t ? "due" : "upcoming";
    return { ...r, status, invoiceId: inv?.id, receiptNo: inv?.receiptNo, paidAt: inv?.paidAt };
  });
}

function planView(plan: InstallmentPlan) {
  const db = getDb();
  const rows = schedule(plan);
  const p = db.patients.find((x) => x.id === plan.patientId);
  const open = plan.status === "active";
  return {
    ...plan,
    patient: p && { id: p.id, hn: p.hn, fullName: p.fullName, phone: p.phone },
    dentistName: db.users.find((u) => u.id === plan.dentistId)?.name,
    rows,
    paid: rows.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0),
    paidCount: rows.filter((r) => r.status === "paid" && r.no > 0).length,
    overdue: open ? rows.filter((r) => r.status === "overdue") : [],
    next: open ? rows.find((r) => r.status !== "paid") : undefined,
  };
}

function draftInvoice(req: AuthedRequest, base: Pick<Invoice, "patientId" | "kind" | "items"> & Partial<Invoice>): Invoice {
  const now = new Date().toISOString();
  const inv: Invoice = {
    id: crypto.randomUUID(),
    clinicId: req.user!.clinicId,
    status: "draft",
    payments: [],
    total: base.items.reduce((s, i) => s + i.qty * i.unitPrice - i.discount, 0),
    createdBy: req.user!.id,
    createdAt: now,
    updatedAt: now,
    ...base,
  };
  getDb().invoices.push(inv);
  return inv;
}

function billRow(req: AuthedRequest, plan: InstallmentPlan, no: number) {
  const row = schedule(plan).find((r) => r.no === no);
  if (!row) return { error: "ไม่พบงวดนี้" };
  if (row.invoiceId) return { invoiceId: row.invoiceId };
  const inv = draftInvoice(req, {
    patientId: plan.patientId,
    kind: "installment",
    planId: plan.id,
    installmentNo: no,
    items: [
      {
        id: crypto.randomUUID(),
        procedureId: plan.procedureId,
        name: no === 0 ? `${plan.title} — เงินดาวน์` : `${plan.title} — งวด ${no}/${plan.count}`,
        teeth: [],
        qty: 1,
        unitPrice: row.amount,
        discount: 0,
        dentistId: plan.dentistId,
      },
    ],
  });
  return { invoiceId: inv.id };
}

export function registerPlanRoutes(app: Express) {
  /** ภาพรวมการเงินของคนไข้: มัดจำคงเหลือ + แผนผ่อน */
  app.get("/api/patients/:patientId/finance", requireRole(...FRONT), (req: AuthedRequest, res) => {
    const p = getDb().patients.find((x) => x.id === req.params.patientId && x.clinicId === req.user!.clinicId);
    if (!p) return bad(res, 404, "ไม่พบคนไข้");
    res.json({
      depositBalance: depositBalance(p.id),
      plans: getDb()
        .plans.filter((x) => x.patientId === p.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(planView),
    });
  });

  /** รับมัดจำ → บิลร่างชนิด deposit แล้วไปรับชำระที่หน้าการเงิน */
  app.post("/api/patients/:patientId/deposits", requireRole(...FRONT), (req: AuthedRequest, res) => {
    const p = getDb().patients.find((x) => x.id === req.params.patientId && x.clinicId === req.user!.clinicId);
    if (!p) return bad(res, 404, "ไม่พบคนไข้");
    const amount = Number(req.body?.amount);
    if (!Number.isInteger(amount) || amount <= 0 || amount > MAX) return bad(res, 400, "จำนวนเงินไม่ถูกต้อง");
    const note = String(req.body?.note ?? "").trim().slice(0, 100);
    const inv = draftInvoice(req, {
      patientId: p.id,
      kind: "deposit",
      items: [{ id: crypto.randomUUID(), name: note ? `รับมัดจำ — ${note}` : "รับมัดจำ", teeth: [], qty: 1, unitPrice: amount, discount: 0 }],
    });
    save();
    notify(inv.clinicId, { type: "billing:changed" });
    res.status(201).json({ invoiceId: inv.id });
  });

  /** รายการแผนผ่อนทั้งคลินิก (หน้าผ่อนชำระ) */
  app.get("/api/plans", requireRole(...FRONT), (req: AuthedRequest, res) => {
    res.json(
      getDb()
        .plans.filter((p) => p.clinicId === req.user!.clinicId)
        .map(planView)
        .sort((a, b) => b.overdue.length - a.overdue.length || (a.next?.due ?? "9").localeCompare(b.next?.due ?? "9")),
    );
  });

  app.post("/api/plans", requireRole(...FRONT), (req: AuthedRequest, res) => {
    const db = getDb();
    const clinicId = req.user!.clinicId;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const p = db.patients.find((x) => x.id === b.patientId && x.clinicId === clinicId);
    if (!p) return bad(res, 400, "เลือกคนไข้");
    const dentist = db.users.find((u) => u.id === b.dentistId && u.clinicId === clinicId && (u.role === "dentist" || u.role === "owner"));
    if (!dentist) return bad(res, 400, "เลือกทันตแพทย์");
    const procedureId = b.procedureId ? String(b.procedureId) : undefined;
    if (procedureId && !db.procedures.some((x) => x.id === procedureId && x.clinicId === clinicId)) return bad(res, 400, "ไม่พบหัตถการ");
    const title = String(b.title ?? "").trim().slice(0, 100);
    if (!title) return bad(res, 400, "ตั้งชื่อแผน เช่น จัดฟันแบบติดแน่น");
    const total = Number(b.total);
    const downPayment = Number(b.downPayment ?? 0);
    const count = Number(b.count);
    if (!Number.isInteger(total) || total <= 0 || total > MAX) return bad(res, 400, "ยอดรวมไม่ถูกต้อง");
    if (!Number.isInteger(downPayment) || downPayment < 0 || downPayment >= total) return bad(res, 400, "เงินดาวน์ต้องน้อยกว่ายอดรวม");
    if (!Number.isInteger(count) || count < 1 || count > 60) return bad(res, 400, "จำนวนงวดต้องเป็น 1–60");
    const firstDue = String(b.firstDue ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDue) || Number.isNaN(Date.parse(firstDue))) return bad(res, 400, "วันครบกำหนดงวดแรกไม่ถูกต้อง");
    const plan: InstallmentPlan = {
      id: crypto.randomUUID(),
      clinicId,
      patientId: p.id,
      dentistId: dentist.id,
      procedureId,
      title,
      total,
      downPayment,
      count,
      firstDue,
      status: "active",
      note: String(b.note ?? "").trim().slice(0, 300) || undefined,
      createdBy: req.user!.id,
      createdAt: new Date().toISOString(),
    };
    db.plans.push(plan);
    const down = downPayment > 0 ? billRow(req, plan, 0) : undefined;
    save();
    audit({ ...ctx(req), action: "CREATE_PLAN", patientId: p.id, target: `${plan.id}:${total}:${count}` });
    notify(clinicId, { type: "billing:changed" });
    res.status(201).json({ plan: planView(plan), invoiceId: down && "invoiceId" in down ? down.invoiceId : undefined });
  });

  /** ออกบิลงวด (ถ้ามีบิลอยู่แล้วคืนบิลเดิม) */
  app.post("/api/plans/:id/bill", requireRole(...FRONT), (req: AuthedRequest, res) => {
    const plan = getDb().plans.find((p) => p.id === req.params.id && p.clinicId === req.user!.clinicId);
    if (!plan) return bad(res, 404, "ไม่พบแผน");
    if (plan.status !== "active") return bad(res, 409, "แผนนี้ปิดแล้ว");
    const r = billRow(req, plan, Number(req.body?.no));
    if ("error" in r) return bad(res, 400, r.error!);
    save();
    notify(plan.clinicId, { type: "billing:changed" });
    res.json(r);
  });

  app.post("/api/plans/:id/cancel", requireRole("owner"), (req: AuthedRequest, res) => {
    const db = getDb();
    const plan = db.plans.find((p) => p.id === req.params.id && p.clinicId === req.user!.clinicId);
    if (!plan) return bad(res, 404, "ไม่พบแผน");
    if (plan.status !== "active") return bad(res, 409, "แผนนี้ปิดแล้ว");
    const reason = String(req.body?.reason ?? "").trim().slice(0, 200);
    if (reason.length < 3) return bad(res, 400, "ระบุเหตุผล");
    plan.status = "cancelled";
    plan.note = [plan.note, `ยกเลิก: ${reason}`].filter(Boolean).join(" · ");
    // บิลงวดที่ยังไม่ชำระ → ลบทิ้ง (เป็นแค่ร่าง ยังไม่มีเลขใบเสร็จ)
    db.invoices = db.invoices.filter((i) => !(i.planId === plan.id && i.status === "draft"));
    save();
    audit({ ...ctx(req), action: "CANCEL_PLAN", patientId: plan.patientId, target: `${plan.id}:${reason}` });
    notify(plan.clinicId, { type: "billing:changed" });
    res.json(planView(plan));
  });
}
