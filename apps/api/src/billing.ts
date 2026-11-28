/**
 * การเงินพื้นฐาน (Phase 1): บิลต่อ visit → รับชำระเงินสด/โอน → ใบเสร็จ → ปิดยอด
 * จำนวนเงินทั้งหมดเป็น "สตางค์" (จำนวนเต็ม) ทั้งใน DB และ API
 */
import crypto from "node:crypto";
import type { Express, Response } from "express";
import { requireRole, type AuthedRequest } from "./auth.js";
import type { Appointment, Db, DayClose, Invoice, InvoiceItem, Payment, PaymentMethod, ProcedureItem } from "./domain.js";
import { notify } from "./realtime.js";
import { deductForInvoice, reverseForInvoice } from "./stock.js";
import { audit, getDb, save } from "./store.js";

const TZ = "Asia/Bangkok";
const localDate = (iso: string | Date) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
const ctx = (req: AuthedRequest) => ({ userId: req.user!.id, clinicId: req.user!.clinicId, ip: req.ip });
const bad = (res: Response, status: number, error: string) => void res.status(status).json({ error });

const MONEY_MAX = 100_000_000; // 1,000,000.00 บาท ต่อบรรทัด/ต่อช่องทาง
const isMoney = (v: unknown, max = MONEY_MAX): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;

/** FDI: ฟันแท้ 11–48, ฟันน้ำนม 51–85 */
export const validTooth = (t: number) => {
  const q = Math.floor(t / 10);
  const n = t % 10;
  return (q >= 1 && q <= 4 && n >= 1 && n <= 8) || (q >= 5 && q <= 8 && n >= 1 && n <= 5);
};

/** เลขซี่ในข้อความ เช่น "อุดฟัน 46 DO" → [46] (ไม่นับเลขในรูป 4/24) */
export const teethIn = (text: string) =>
  [...new Set([...text.matchAll(/(?<![\d/])([1-8][1-8])(?![\d/])/g)].map((m) => Number(m[1])))].filter(validTooth);

export function matchProcedure(procs: ProcedureItem[], text: string) {
  const t = text.toLowerCase();
  return procs.find((p) => p.keywords.some((k) => t.includes(k.toLowerCase())));
}

export const lineTotal = (i: Pick<InvoiceItem, "qty" | "unitPrice" | "discount">) => i.qty * i.unitPrice - i.discount;
export const invoiceTotal = (items: InvoiceItem[]) => items.reduce((s, i) => s + lineTotal(i), 0);

const item = (p: ProcedureItem | undefined, name: string, teeth: number[], dentistId: string): InvoiceItem => ({
  id: crypto.randomUUID(),
  procedureId: p?.id,
  name: p ? p.name : name,
  teeth,
  qty: 1,
  unitPrice: p?.price ?? 0,
  discount: 0,
  dentistId,
});

/**
 * รายการตั้งต้นของบิล (เคาน์เตอร์ไม่ต้องพิมพ์ใหม่):
 *  1) หัตถการในผังฟันที่ "ทำเสร็จแล้ว" และบันทึกในวันเดียวกับ visit
 *  2) ถ้าไม่มี ใช้หัตถการของนัด จับคู่กับรายการราคาของคลินิก
 */
export function draftItems(db: Db, a: Appointment): InvoiceItem[] {
  const procs = db.procedures.filter((p) => p.clinicId === a.clinicId && p.active !== false);
  const day = a.start.slice(0, 10);
  const fromChart = Object.values(db.charts[a.patientId] ?? {})
    .filter(
      (r) =>
        r.procedure &&
        localDate(r.updatedAt) === day &&
        (r.whole === "completed" || Object.values(r.surfaces).includes("completed")),
    )
    .map((r) => item(matchProcedure(procs, r.procedure!), r.procedure!, [r.tooth], a.dentistId));
  if (fromChart.length) return fromChart;
  const p = matchProcedure(procs, a.procedure);
  return p ? [item(p, a.procedure, teethIn(a.procedure), a.dentistId)] : [];
}

function newInvoice(db: Db, a: Appointment, userId: string, items = draftItems(db, a)): Invoice {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    clinicId: a.clinicId,
    patientId: a.patientId,
    appointmentId: a.id,
    status: "draft",
    items,
    payments: [],
    total: invoiceTotal(items),
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  };
}

/** เปิดบิลร่างให้ visit (ถ้ายังไม่มี) — เรียกตอนทันตแพทย์กด "เสร็จการรักษา" */
export function ensureDraft(a: Appointment, userId: string) {
  const db = getDb();
  const existing = db.invoices.find((i) => i.appointmentId === a.id && i.status !== "void");
  if (existing) return existing;
  const inv = newInvoice(db, a, userId);
  db.invoices.push(inv);
  return inv;
}

/** เลขใบเสร็จ RC{ปี พ.ศ. 2 หลัก}{เดือน}-{ลำดับ} เช่น RC6911-0001 */
function nextReceiptNo(clinicId: string, at: Date) {
  const [y, m] = localDate(at).split("-");
  const prefix = `RC${String(Number(y) + 543).slice(2)}${m}-`;
  const n = getDb().invoices.filter((i) => i.clinicId === clinicId && i.receiptNo?.startsWith(prefix)).length;
  return `${prefix}${String(n + 1).padStart(4, "0")}`;
}

export function invoiceForAppointment(appointmentId: string) {
  const list = getDb().invoices.filter((i) => i.appointmentId === appointmentId && i.status !== "void");
  return list.find((i) => i.status === "draft") ?? list[0];
}

const userName = (id?: string) => (id ? getDb().users.find((u) => u.id === id)?.name : undefined);

function summary(inv: Invoice) {
  const db = getDb();
  const p = db.patients.find((x) => x.id === inv.patientId);
  const a = db.appointments.find((x) => x.id === inv.appointmentId);
  return {
    id: inv.id,
    status: inv.status,
    kind: inv.kind ?? "service",
    total: inv.total,
    receiptNo: inv.receiptNo,
    paidAt: inv.paidAt,
    createdAt: inv.createdAt,
    closed: !!inv.closeId,
    methods: [...new Set(inv.payments.map((x) => x.method))],
    patient: p && { id: p.id, hn: p.hn, fullName: p.fullName, allergies: p.allergies },
    queueNo: a?.queueNo,
    visitDate: a?.start.slice(0, 10) ?? localDate(inv.createdAt),
    procedure: a?.procedure,
    dentistName: userName(a?.dentistId),
  };
}

function detail(inv: Invoice) {
  const db = getDb();
  const clinic = db.clinics.find((c) => c.id === inv.clinicId);
  return {
    ...inv,
    ...summary(inv),
    items: inv.items.map((i) => ({ ...i, dentistName: userName(i.dentistId) })),
    paidByName: userName(inv.paidBy),
    voidedByName: userName(inv.voidedBy),
    clinic: clinic && { name: clinic.name, address: clinic.address, taxId: clinic.taxId, phone: clinic.phone },
  };
}

function parseItems(raw: unknown, clinicId: string): { ok: InvoiceItem[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length > 50) return { error: "รายการไม่ถูกต้อง" };
  const db = getDb();
  const items: InvoiceItem[] = [];
  for (const [n, r] of (raw as Record<string, unknown>[]).entries()) {
    const at = `รายการที่ ${n + 1}: `;
    const name = String(r?.name ?? "").trim().slice(0, 200);
    if (!name) return { error: `${at}ระบุชื่อรายการ` };
    const qty = Number(r.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) return { error: `${at}จำนวนต้องเป็น 1–99` };
    const unitPrice = Number(r.unitPrice);
    if (!isMoney(unitPrice)) return { error: `${at}ราคาไม่ถูกต้อง` };
    const discount = Number(r.discount ?? 0);
    if (!isMoney(discount) || discount > qty * unitPrice) return { error: `${at}ส่วนลดต้องไม่เกินราคา` };
    const teeth = Array.isArray(r.teeth) ? [...new Set(r.teeth.map(Number))] : [];
    if (teeth.length > 32 || !teeth.every((t) => Number.isInteger(t) && validTooth(t))) return { error: `${at}เลขซี่ไม่ถูกต้อง` };
    const procedureId = r.procedureId ? String(r.procedureId) : undefined;
    if (procedureId && !db.procedures.some((p) => p.id === procedureId && p.clinicId === clinicId)) return { error: `${at}ไม่พบหัตถการ` };
    const dentistId = r.dentistId ? String(r.dentistId) : undefined;
    if (dentistId && !db.users.some((u) => u.id === dentistId && u.clinicId === clinicId && (u.role === "dentist" || u.role === "owner")))
      return { error: `${at}ไม่พบทันตแพทย์` };
    const id = typeof r.id === "string" && /^[\w-]{1,64}$/.test(r.id) ? r.id : crypto.randomUUID();
    items.push({ id, procedureId, name, teeth, qty, unitPrice, discount, dentistId });
  }
  return { ok: items };
}

/** มัดจำคงเหลือ = รับมัดจำ (ใบเสร็จมัดจำที่ชำระแล้ว) − ที่ตัดใช้ไปในบิลอื่น */
export function depositBalance(patientId: string) {
  let bal = 0;
  for (const i of getDb().invoices) {
    if (i.patientId !== patientId || i.status !== "paid") continue;
    if (i.kind === "deposit") bal += i.total;
    for (const p of i.payments) if (p.method === "deposit") bal -= p.amount;
  }
  return bal;
}

const METHODS: PaymentMethod[] = ["cash", "transfer", "card", "deposit"];

function parsePayments(raw: unknown, total: number, inv: Invoice): { ok: Payment[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length > 4) return { error: "ช่องทางชำระไม่ถูกต้อง" };
  const out: Payment[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const method = r?.method as PaymentMethod;
    if (!METHODS.includes(method)) return { error: "ช่องทางชำระไม่ถูกต้อง" };
    const amount = Number(r.amount);
    if (!isMoney(amount) || amount === 0) return { error: "จำนวนเงินไม่ถูกต้อง" };
    const p: Payment = { method, amount };
    if (method === "cash") {
      const received = r.received == null || r.received === "" ? amount : Number(r.received);
      if (!isMoney(received) || received < amount) return { error: "เงินสดที่รับมาน้อยกว่ายอดที่ชำระ" };
      p.received = received;
    } else if (method !== "deposit") {
      const ref = String(r.ref ?? "").trim().slice(0, 50);
      if (ref) p.ref = ref;
    }
    out.push(p);
  }
  const fromDeposit = out.filter((p) => p.method === "deposit").reduce((s, p) => s + p.amount, 0);
  if (fromDeposit) {
    if (inv.kind === "deposit") return { error: "ใช้มัดจำจ่ายค่ามัดจำไม่ได้" };
    const bal = depositBalance(inv.patientId);
    if (fromDeposit > bal) return { error: `มัดจำคงเหลือ ${(bal / 100).toFixed(2)} ไม่พอ` };
  }
  const sum = out.reduce((s, p) => s + p.amount, 0);
  if (sum !== total) return { error: `ยอดชำระ (${(sum / 100).toFixed(2)}) ไม่ตรงกับยอดบิล (${(total / 100).toFixed(2)})` };
  return { ok: out };
}

/** ใบเสร็จที่ยังไม่ถูกปิดยอด */
const unclosed = (clinicId: string) => getDb().invoices.filter((i) => i.clinicId === clinicId && i.receiptNo && !i.closeId);

function closeTotals(list: Invoice[]) {
  const paid = list.filter((i) => i.status === "paid");
  const byMethod: Record<PaymentMethod, number> = { cash: 0, transfer: 0, card: 0, deposit: 0 };
  for (const i of paid) for (const p of i.payments) byMethod[p.method] += p.amount;
  return {
    receiptCount: paid.length,
    voidCount: list.length - paid.length,
    // เงินที่รับเข้าจริง (ไม่นับส่วนที่ตัดจากมัดจำ ซึ่งนับไปแล้วตอนรับมัดจำ)
    total: byMethod.cash + byMethod.transfer + byMethod.card,
    byMethod,
  };
}

const FRONT = ["owner", "receptionist"] as const;

export function registerBillingRoutes(app: Express) {
  /** รายการหัตถการและราคา (ทุกบทบาท — หมอใช้ดูราคาตอนคุยแผนการรักษา) · ไม่รวมรายการที่ปิดใช้งาน */
  app.get("/api/procedures", (req: AuthedRequest, res) => {
    res.json(getDb().procedures.filter((p) => p.clinicId === req.user!.clinicId && p.active !== false));
  });

  /** หน้ารับชำระ: บิลรอชำระ + ใบเสร็จวันนี้ */
  app.get("/api/billing/worklist", requireRole(...FRONT), (req: AuthedRequest, res) => {
    const mine = getDb().invoices.filter((i) => i.clinicId === req.user!.clinicId);
    const today = localDate(new Date());
    res.json({
      pending: mine.filter((i) => i.status === "draft").sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(summary),
      today: mine
        .filter((i) => i.paidAt && localDate(i.paidAt) === today)
        .sort((a, b) => b.paidAt!.localeCompare(a.paidAt!))
        .map(summary),
    });
  });

  app.get("/api/invoices", requireRole(...FRONT), (req: AuthedRequest, res) => {
    const pid = String(req.query.patientId ?? "");
    res.json(
      getDb()
        .invoices.filter((i) => i.clinicId === req.user!.clinicId && i.patientId === pid)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(summary),
    );
  });

  const find = (req: AuthedRequest) => getDb().invoices.find((i) => i.id === req.params.id && i.clinicId === req.user!.clinicId);

  app.get("/api/invoices/:id", requireRole(...FRONT), (req: AuthedRequest, res) => {
    const inv = find(req);
    if (!inv) return bad(res, 404, "ไม่พบบิล");
    if (inv.receiptNo && req.query.print) audit({ ...ctx(req), action: "VIEW_RECEIPT", patientId: inv.patientId, target: inv.receiptNo });
    res.json(detail(inv));
  });

  app.put("/api/invoices/:id", requireRole(...FRONT), (req: AuthedRequest, res) => {
    const inv = find(req);
    if (!inv) return bad(res, 404, "ไม่พบบิล");
    if (inv.status !== "draft") return bad(res, 409, "บิลนี้ชำระแล้ว แก้ไขไม่ได้");
    const r = parseItems(req.body?.items, inv.clinicId);
    if ("error" in r) return bad(res, 400, r.error);
    Object.assign(inv, { items: r.ok, total: invoiceTotal(r.ok), updatedAt: new Date().toISOString() });
    save();
    audit({ ...ctx(req), action: "UPDATE_INVOICE", patientId: inv.patientId, target: inv.id });
    notify(inv.clinicId, { type: "billing:changed" });
    res.json(detail(inv));
  });

  /** รับชำระ: บันทึกรายการ (ถ้าส่งมา) + ช่องทางชำระ → ออกเลขใบเสร็จ → ปิด visit */
  app.post("/api/invoices/:id/pay", requireRole(...FRONT), (req: AuthedRequest, res) => {
    const inv = find(req);
    if (!inv) return bad(res, 404, "ไม่พบบิล");
    if (inv.status !== "draft") return bad(res, 409, "บิลนี้ชำระแล้ว");
    let items = inv.items;
    if (req.body?.items !== undefined) {
      const r = parseItems(req.body.items, inv.clinicId);
      if ("error" in r) return bad(res, 400, r.error);
      items = r.ok;
    }
    if (!items.length) return bad(res, 400, "ยังไม่มีรายการในบิล");
    const total = invoiceTotal(items);
    const p = parsePayments(req.body?.payments ?? [], total, inv);
    if ("error" in p) return bad(res, 400, p.error);

    const now = new Date();
    Object.assign(inv, {
      items,
      total,
      payments: p.ok,
      status: "paid",
      receiptNo: nextReceiptNo(inv.clinicId, now),
      paidAt: now.toISOString(),
      paidBy: req.user!.id,
      updatedAt: now.toISOString(),
    });
    const a = getDb().appointments.find((x) => x.id === inv.appointmentId);
    if (a && a.status === "awaiting_payment") Object.assign(a, { status: "done", updatedAt: now.toISOString() });
    if (inv.kind !== "deposit") deductForInvoice(inv, req.user!.id);
    if (inv.planId) completePlanIfDone(inv.planId);
    save();
    audit({ ...ctx(req), action: "PAYMENT", patientId: inv.patientId, target: `${inv.receiptNo}:${total}` });
    notify(inv.clinicId, { type: "billing:changed" });
    notify(inv.clinicId, { type: "queue:changed" });
    res.json(detail(inv));
  });

  /** ยกเลิกใบเสร็จ (เจ้าของเท่านั้น ก่อนปิดยอด) → เปิดบิลร่างใบใหม่ให้ออกแทน */
  app.post("/api/invoices/:id/void", requireRole("owner"), (req: AuthedRequest, res) => {
    const inv = find(req);
    if (!inv) return bad(res, 404, "ไม่พบบิล");
    if (inv.status !== "paid") return bad(res, 409, "ยกเลิกได้เฉพาะใบเสร็จที่ชำระแล้ว");
    if (inv.closeId) return bad(res, 409, "ปิดยอดรอบนี้ไปแล้ว ยกเลิกใบเสร็จไม่ได้");
    const reason = String(req.body?.reason ?? "").trim().slice(0, 300);
    if (reason.length < 3) return bad(res, 400, "ระบุเหตุผลที่ยกเลิก");
    if (inv.kind === "deposit" && depositBalance(inv.patientId) < inv.total) return bad(res, 409, "มัดจำนี้ถูกใช้ไปแล้ว ยกเลิกไม่ได้");
    const now = new Date().toISOString();
    Object.assign(inv, { status: "void", voidReason: reason, voidedAt: now, voidedBy: req.user!.id, updatedAt: now });
    reverseForInvoice(inv, req.user!.id);
    const plan = inv.planId && getDb().plans.find((x) => x.id === inv.planId);
    if (plan && plan.status === "completed") plan.status = "active";
    const db = getDb();
    const replacement: Invoice = {
      ...structuredClone(inv),
      id: crypto.randomUUID(),
      status: "draft",
      payments: [],
      receiptNo: undefined,
      paidAt: undefined,
      paidBy: undefined,
      voidReason: undefined,
      voidedAt: undefined,
      voidedBy: undefined,
      replaces: inv.id,
      createdBy: req.user!.id,
      createdAt: now,
      updatedAt: now,
    };
    db.invoices.push(replacement);
    save();
    audit({ ...ctx(req), action: "VOID_RECEIPT", patientId: inv.patientId, target: `${inv.receiptNo}:${reason}` });
    notify(inv.clinicId, { type: "billing:changed" });
    res.json({ voided: detail(inv), replacement: detail(replacement) });
  });

  /** สรุปยอดที่ยังไม่ปิด + ประวัติการปิดยอด */
  app.get("/api/billing/close", requireRole(...FRONT), (req: AuthedRequest, res) => {
    const clinicId = req.user!.clinicId;
    const list = unclosed(clinicId);
    const closes = getDb()
      .closes.filter((c) => c.clinicId === clinicId)
      .sort((a, b) => b.closedAt.localeCompare(a.closedAt))
      .slice(0, 20)
      .map((c) => ({ ...c, closedByName: userName(c.closedBy) }));
    res.json({
      ...closeTotals(list),
      since: closes[0]?.closedAt,
      receipts: list.sort((a, b) => a.paidAt!.localeCompare(b.paidAt!)).map((i) => ({ ...summary(i), payments: i.payments })),
      history: closes,
    });
  });

  app.post("/api/billing/close", requireRole(...FRONT), (req: AuthedRequest, res) => {
    const clinicId = req.user!.clinicId;
    const float = Number(req.body?.float ?? 0);
    const cashCounted = Number(req.body?.cashCounted);
    if (!isMoney(float) || !isMoney(cashCounted)) return bad(res, 400, "กรอกจำนวนเงินให้ถูกต้อง");
    const list = unclosed(clinicId);
    if (!list.length) return bad(res, 409, "ไม่มีใบเสร็จที่ต้องปิดยอด");
    const t = closeTotals(list);
    const c: DayClose = {
      id: crypto.randomUUID(),
      clinicId,
      closedAt: new Date().toISOString(),
      closedBy: req.user!.id,
      ...t,
      float,
      cashCounted,
      diff: cashCounted - (float + t.byMethod.cash),
      note: String(req.body?.note ?? "").trim().slice(0, 500) || undefined,
    };
    if (c.diff !== 0 && !c.note) return bad(res, 400, "ยอดเงินสดไม่ตรง ระบุหมายเหตุก่อนปิดยอด");
    for (const i of list) i.closeId = c.id;
    getDb().closes.push(c);
    save();
    audit({ ...ctx(req), action: "DAY_CLOSE", target: `${c.id}:${c.total}:${c.diff}` });
    notify(clinicId, { type: "billing:changed" });
    res.status(201).json({ ...c, closedByName: userName(c.closedBy) });
  });
}

/** แผนผ่อนครบทุกงวด (รวมเงินดาวน์) → completed */
export function completePlanIfDone(planId: string) {
  const db = getDb();
  const plan = db.plans.find((p) => p.id === planId);
  if (!plan || plan.status !== "active") return;
  const paid = new Set(db.invoices.filter((i) => i.planId === planId && i.status === "paid").map((i) => i.installmentNo));
  const need = [...(plan.downPayment > 0 ? [0] : []), ...Array.from({ length: plan.count }, (_, i) => i + 1)];
  if (need.every((n) => paid.has(n))) plan.status = "completed";
}
