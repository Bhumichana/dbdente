/**
 * ตั้งค่าคลินิก (เจ้าของคลินิกเท่านั้น): ข้อมูลคลินิก · PIN Kiosk · หัตถการและราคา · วัสดุ · แล็บ · เก้าอี้ · ผู้ใช้
 *
 * ไม่ลบข้อมูลจริง — ใช้ "ปิดใช้งาน" (active: false) แทน เพราะบิล/นัด/งานแล็บเก่ายังอ้างถึงอยู่
 * รายการที่ปิดใช้งานจะไม่แสดงในตัวเลือกของหน้าอื่น แต่ชื่อในเอกสารเดิมยังอ่านได้
 */
import crypto from "node:crypto";
import type { Express, Response } from "express";
import { requireRole, type AuthedRequest } from "./auth.js";
import type { Chair, Lab, ProcedureItem, Role, StockItem, User } from "./domain.js";
import { notify } from "./realtime.js";
import { audit, getDb, save } from "./store.js";

const ctx = (req: AuthedRequest) => ({ userId: req.user!.id, clinicId: req.user!.clinicId, ip: req.ip });
const bad = (res: Response, status: number, error: string, field?: string) => void res.status(status).json({ error, field });

/** ใช้งานอยู่ (ข้อมูลเก่าที่ไม่มีฟิลด์ active ถือว่าใช้งาน) */
export const isActive = (x: { active?: boolean }) => x.active !== false;

const ROLES: Role[] = ["owner", "dentist", "receptionist", "assistant"];
const MONEY_MAX = 100_000_000; // 1,000,000.00 บาท
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const str = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const opt = (v: unknown, max: number) => str(v, max) || undefined;
const isMoney = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MONEY_MAX;
const round2 = (n: number) => Math.round(n * 100) / 100;
const newId = (prefix: string) => `${prefix}${crypto.randomUUID().slice(0, 8)}`;

type Parsed<T> = { ok: T } | { error: string; field: string };

// ---------- parsers ----------
function parseProcedure(b: Record<string, unknown>, clinicId: string, selfId?: string): Parsed<Omit<ProcedureItem, "id" | "clinicId">> {
  const db = getDb();
  const code = str(b.code, 20).toUpperCase();
  if (!/^[A-Z0-9-]{1,20}$/.test(code)) return { error: "รหัสใช้ได้เฉพาะ A–Z, 0–9 และ -", field: "code" };
  if (db.procedures.some((p) => p.clinicId === clinicId && p.id !== selfId && p.code === code)) return { error: `รหัส ${code} มีอยู่แล้ว`, field: "code" };
  const name = str(b.name, 120);
  if (name.length < 2) return { error: "กรอกชื่อหัตถการ", field: "name" };
  const category = str(b.category, 60);
  if (!category) return { error: "ระบุหมวด", field: "category" };
  if (!isMoney(b.price)) return { error: "ราคาไม่ถูกต้อง", field: "price" };
  const materialCost = b.materialCost === undefined || b.materialCost === null ? 0 : b.materialCost;
  if (!isMoney(materialCost)) return { error: "ค่าวัสดุไม่ถูกต้อง", field: "materialCost" };
  if (materialCost > b.price) return { error: "ค่าวัสดุมากกว่าราคา", field: "materialCost" };
  const keywords = Array.isArray(b.keywords)
    ? [...new Set(b.keywords.map((k) => str(k, 40)).filter(Boolean))].slice(0, 20)
    : [];
  const materials: { itemId: string; qty: number }[] = [];
  for (const m of Array.isArray(b.materials) ? b.materials : []) {
    const itemId = String((m as Record<string, unknown>)?.itemId ?? "");
    const qty = Number((m as Record<string, unknown>)?.qty);
    if (!db.stockItems.some((s) => s.id === itemId && s.clinicId === clinicId)) return { error: "ไม่พบวัสดุที่เลือก", field: "materials" };
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1000) return { error: "จำนวนวัสดุต่อครั้งไม่ถูกต้อง", field: "materials" };
    if (materials.some((x) => x.itemId === itemId)) return { error: "เลือกวัสดุซ้ำ", field: "materials" };
    materials.push({ itemId, qty: round2(qty) });
  }
  return {
    ok: {
      code,
      name,
      category,
      price: b.price,
      keywords,
      materialCost: materialCost || undefined,
      materials: materials.length ? materials : undefined,
      active: b.active === false ? false : undefined,
    },
  };
}

function parseMaterial(b: Record<string, unknown>, clinicId: string, selfId?: string): Parsed<Pick<StockItem, "code" | "name" | "unit" | "category" | "reorderPoint" | "active">> {
  const code = str(b.code, 20).toUpperCase();
  if (!/^[A-Z0-9-]{1,20}$/.test(code)) return { error: "รหัสใช้ได้เฉพาะ A–Z, 0–9 และ -", field: "code" };
  if (getDb().stockItems.some((s) => s.clinicId === clinicId && s.id !== selfId && s.code === code)) return { error: `รหัส ${code} มีอยู่แล้ว`, field: "code" };
  const name = str(b.name, 120);
  if (name.length < 2) return { error: "กรอกชื่อวัสดุ", field: "name" };
  const unit = str(b.unit, 20);
  if (!unit) return { error: "ระบุหน่วยนับ", field: "unit" };
  const category = str(b.category, 60);
  if (!category) return { error: "ระบุหมวด", field: "category" };
  const rp = Number(b.reorderPoint ?? 0);
  if (!Number.isFinite(rp) || rp < 0 || rp > 100000) return { error: "จุดสั่งซื้อไม่ถูกต้อง", field: "reorderPoint" };
  return { ok: { code, name, unit, category, reorderPoint: round2(rp), active: b.active === false ? false : undefined } };
}

function parseLab(b: Record<string, unknown>): Parsed<Pick<Lab, "name" | "phone" | "active">> {
  const name = str(b.name, 120);
  if (name.length < 2) return { error: "กรอกชื่อแล็บ", field: "name" };
  const phone = String(b.phone ?? "").replace(/[\s-]/g, "");
  if (phone && !/^0\d{8,9}$/.test(phone)) return { error: "เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0", field: "phone" };
  return { ok: { name, phone: phone || undefined, active: b.active === false ? false : undefined } };
}

/** เจ้าของที่ยังใช้งานได้ ต้องเหลืออย่างน้อย 1 คนเสมอ (กันล็อกตัวเองออกจากหน้าตั้งค่า) */
function wouldLeaveNoOwner(clinicId: string, userId: string, next: Pick<User, "role" | "active">) {
  if (next.role === "owner" && isActive(next)) return false;
  return !getDb().users.some((u) => u.clinicId === clinicId && u.id !== userId && u.role === "owner" && isActive(u));
}

export function registerSettingsRoutes(app: Express) {
  const owner = requireRole("owner");

  app.get("/api/settings", owner, (req: AuthedRequest, res) => {
    const db = getDb();
    const cid = req.user!.clinicId;
    const clinic = db.clinics.find((c) => c.id === cid)!;
    const { kioskPinHash, ...clinicInfo } = clinic;
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
    res.json({
      clinic: { ...clinicInfo, hasKioskPin: Boolean(kioskPinHash) },
      procedures: db.procedures.filter((p) => p.clinicId === cid),
      materials: db.stockItems
        .filter((s) => s.clinicId === cid)
        .map(({ lots, ...s }) => ({ ...s, onHand: round2(lots.reduce((n, l) => n + l.qty, 0)) })),
      labs: db.labs
        .filter((l) => l.clinicId === cid)
        .map((l) => ({ ...l, openCases: db.labCases.filter((c) => c.labId === l.id && ["sent", "received", "remake"].includes(c.status)).length })),
      chairs: db.chairs
        .filter((c) => c.clinicId === cid)
        .map((c) => ({ ...c, upcoming: db.appointments.filter((a) => a.chairId === c.id && a.start >= today && ["booked", "arrived", "in_room"].includes(a.status)).length })),
      users: db.users.filter((u) => u.clinicId === cid),
    });
  });

  // ----- ข้อมูลคลินิก (หัวใบเสร็จ) -----
  app.put("/api/settings/clinic", owner, (req: AuthedRequest, res) => {
    const clinic = getDb().clinics.find((c) => c.id === req.user!.clinicId)!;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const name = str(b.name, 120);
    if (name.length < 2) return bad(res, 400, "กรอกชื่อคลินิก", "name");
    const taxId = String(b.taxId ?? "").replace(/[\s-]/g, "");
    if (taxId && !/^\d{13}$/.test(taxId)) return bad(res, 400, "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก", "taxId");
    const phone = String(b.phone ?? "").replace(/[\s-]/g, "");
    if (phone && !/^0\d{8,9}$/.test(phone)) return bad(res, 400, "เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0", "phone");
    Object.assign(clinic, { name, address: opt(b.address, 300), taxId: taxId || undefined, phone: phone || undefined });
    save();
    audit({ ...ctx(req), action: "SETTINGS", target: "clinic" });
    const { kioskPinHash, ...info } = clinic;
    res.json({ ...info, hasKioskPin: Boolean(kioskPinHash) });
  });

  app.put("/api/settings/kiosk-pin", owner, (req: AuthedRequest, res) => {
    const pin = String(req.body?.pin ?? "");
    if (!/^\d{4,8}$/.test(pin)) return bad(res, 400, "PIN ต้องเป็นตัวเลข 4–8 หลัก", "pin");
    if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin))
      return bad(res, 400, "PIN เดาง่ายเกินไป (เลขซ้ำ/เรียงกัน)", "pin");
    getDb().clinics.find((c) => c.id === req.user!.clinicId)!.kioskPinHash = sha256(pin);
    save();
    audit({ ...ctx(req), action: "SETTINGS", target: "kiosk-pin" });
    res.json({ ok: true });
  });

  // ----- หัตถการและราคา -----
  app.post("/api/settings/procedures", owner, (req: AuthedRequest, res) => {
    const cid = req.user!.clinicId;
    const r = parseProcedure(req.body ?? {}, cid);
    if ("error" in r) return bad(res, 400, r.error, r.field);
    const p: ProcedureItem = { id: newId("proc-"), clinicId: cid, ...r.ok };
    getDb().procedures.push(p);
    save();
    audit({ ...ctx(req), action: "SETTINGS", target: `procedure:${p.code}:create` });
    res.status(201).json(p);
  });

  app.put("/api/settings/procedures/:id", owner, (req: AuthedRequest, res) => {
    const cid = req.user!.clinicId;
    const p = getDb().procedures.find((x) => x.id === req.params.id && x.clinicId === cid);
    if (!p) return bad(res, 404, "ไม่พบหัตถการ");
    const r = parseProcedure(req.body ?? {}, cid, p.id);
    if ("error" in r) return bad(res, 400, r.error, r.field);
    const priceChange = r.ok.price !== p.price ? `:price ${p.price}→${r.ok.price}` : "";
    // เขียนทับทุกฟิลด์ (ฟิลด์ที่เป็น undefined = ล้างค่า) — บิลเก่าเก็บชื่อ/ราคาไว้ในตัวเองแล้ว ไม่กระทบ
    Object.assign(p, { keywords: [], materialCost: undefined, materials: undefined, active: undefined }, r.ok);
    save();
    audit({ ...ctx(req), action: "SETTINGS", target: `procedure:${p.code}${priceChange}` });
    res.json(p);
  });

  // ----- วัสดุ (รายการในสต็อก — รับเข้า/เบิกทำที่หน้าสต็อก) -----
  app.post("/api/settings/materials", owner, (req: AuthedRequest, res) => {
    const cid = req.user!.clinicId;
    const r = parseMaterial(req.body ?? {}, cid);
    if ("error" in r) return bad(res, 400, r.error, r.field);
    const it: StockItem = { id: newId("stk-"), clinicId: cid, ...r.ok, lots: [] };
    getDb().stockItems.push(it);
    save();
    audit({ ...ctx(req), action: "SETTINGS", target: `material:${it.code}:create` });
    res.status(201).json({ ...it, onHand: 0 });
  });

  app.put("/api/settings/materials/:id", owner, (req: AuthedRequest, res) => {
    const cid = req.user!.clinicId;
    const db = getDb();
    const it = db.stockItems.find((x) => x.id === req.params.id && x.clinicId === cid);
    if (!it) return bad(res, 404, "ไม่พบวัสดุ");
    const r = parseMaterial(req.body ?? {}, cid, it.id);
    if ("error" in r) return bad(res, 400, r.error, r.field);
    if (r.ok.active === false && isActive(it)) {
      const usedBy = db.procedures.filter((p) => p.clinicId === cid && isActive(p) && p.materials?.some((m) => m.itemId === it.id));
      if (usedBy.length) return bad(res, 409, `ยังผูกกับหัตถการ: ${usedBy.map((p) => p.name).join(", ")} — เอาออกจากหัตถการก่อน`);
    }
    Object.assign(it, { active: undefined }, r.ok);
    save();
    audit({ ...ctx(req), action: "SETTINGS", target: `material:${it.code}` });
    res.json({ ...it, lots: undefined, onHand: round2(it.lots.reduce((n, l) => n + l.qty, 0)) });
  });

  // ----- แล็บ -----
  app.post("/api/settings/labs", owner, (req: AuthedRequest, res) => {
    const r = parseLab(req.body ?? {});
    if ("error" in r) return bad(res, 400, r.error, r.field);
    const lab: Lab = { id: newId("lab-"), clinicId: req.user!.clinicId, ...r.ok };
    getDb().labs.push(lab);
    save();
    audit({ ...ctx(req), action: "SETTINGS", target: `lab:${lab.id}:create` });
    res.status(201).json({ ...lab, openCases: 0 });
  });

  app.put("/api/settings/labs/:id", owner, (req: AuthedRequest, res) => {
    const db = getDb();
    const lab = db.labs.find((x) => x.id === req.params.id && x.clinicId === req.user!.clinicId);
    if (!lab) return bad(res, 404, "ไม่พบแล็บ");
    const r = parseLab(req.body ?? {});
    if ("error" in r) return bad(res, 400, r.error, r.field);
    Object.assign(lab, { phone: undefined, active: undefined }, r.ok);
    save();
    audit({ ...ctx(req), action: "SETTINGS", target: `lab:${lab.id}` });
    // งานที่ค้างอยู่กับแล็บที่ปิดใช้งาน ยังติดตามต่อได้ในหน้างานแล็บ แค่ส่งงานใหม่ไม่ได้
    res.json({ ...lab, openCases: db.labCases.filter((c) => c.labId === lab.id && ["sent", "received", "remake"].includes(c.status)).length });
  });

  // ----- เก้าอี้ทำฟัน -----
  app.post("/api/settings/chairs", owner, (req: AuthedRequest, res) => {
    const name = str(req.body?.name, 40);
    if (!name) return bad(res, 400, "กรอกชื่อเก้าอี้", "name");
    const cid = req.user!.clinicId;
    if (getDb().chairs.some((c) => c.clinicId === cid && c.name === name)) return bad(res, 409, `มี “${name}” แล้ว`, "name");
    const chair: Chair = { id: newId("chair-"), clinicId: cid, name, status: "available", updatedAt: new Date().toISOString() };
    getDb().chairs.push(chair);
    save();
    audit({ ...ctx(req), action: "SETTINGS", target: `chair:${chair.id}:create` });
    notify(cid, { type: "queue:changed" });
    res.status(201).json({ ...chair, upcoming: 0 });
  });

  app.put("/api/settings/chairs/:id", owner, (req: AuthedRequest, res) => {
    const db = getDb();
    const cid = req.user!.clinicId;
    const chair = db.chairs.find((c) => c.id === req.params.id && c.clinicId === cid);
    if (!chair) return bad(res, 404, "ไม่พบเก้าอี้");
    const name = str(req.body?.name, 40);
    if (!name) return bad(res, 400, "กรอกชื่อเก้าอี้", "name");
    if (db.chairs.some((c) => c.clinicId === cid && c.id !== chair.id && c.name === name)) return bad(res, 409, `มี “${name}” แล้ว`, "name");
    const active = req.body?.active !== false;
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
    const upcoming = db.appointments.filter((a) => a.chairId === chair.id && a.start >= today && ["booked", "arrived", "in_room"].includes(a.status));
    if (!active && isActive(chair)) {
      if (upcoming.some((a) => a.status === "in_room")) return bad(res, 409, `${chair.name} มีคนไข้อยู่ในห้อง`);
      if (upcoming.length) return bad(res, 409, `${chair.name} ยังมีนัดล่วงหน้า ${upcoming.length} นัด — ย้ายนัดไปเก้าอี้อื่นก่อน`);
      if (db.chairs.filter((c) => c.clinicId === cid && isActive(c)).length <= 1) return bad(res, 409, "ต้องมีเก้าอี้ที่ใช้งานอย่างน้อย 1 ตัว");
    }
    chair.name = name;
    chair.active = active ? undefined : false;
    chair.updatedAt = new Date().toISOString();
    save();
    audit({ ...ctx(req), action: "SETTINGS", target: `chair:${chair.id}${active ? "" : ":disable"}` });
    notify(cid, { type: "queue:changed" });
    res.json({ ...chair, upcoming: upcoming.length });
  });

  // ----- ผู้ใช้และบทบาท -----
  const parseUser = (b: Record<string, unknown>): Parsed<Pick<User, "name" | "role" | "active">> => {
    const name = str(b.name, 100);
    if (name.length < 2) return { error: "กรอกชื่อผู้ใช้", field: "name" };
    if (!ROLES.includes(b.role as Role)) return { error: "เลือกบทบาท", field: "role" };
    return { ok: { name, role: b.role as Role, active: b.active === false ? false : undefined } };
  };

  app.post("/api/settings/users", owner, (req: AuthedRequest, res) => {
    const r = parseUser(req.body ?? {});
    if ("error" in r) return bad(res, 400, r.error, r.field);
    const u: User = { id: newId("u-"), clinicId: req.user!.clinicId, ...r.ok };
    getDb().users.push(u);
    save();
    audit({ ...ctx(req), action: "SETTINGS", target: `user:${u.id}:create:${u.role}` });
    res.status(201).json(u);
  });

  app.put("/api/settings/users/:id", owner, (req: AuthedRequest, res) => {
    const cid = req.user!.clinicId;
    const u = getDb().users.find((x) => x.id === req.params.id && x.clinicId === cid);
    if (!u) return bad(res, 404, "ไม่พบผู้ใช้");
    const r = parseUser(req.body ?? {});
    if ("error" in r) return bad(res, 400, r.error, r.field);
    if (u.id === req.user!.id && (r.ok.role !== "owner" || r.ok.active === false))
      return bad(res, 409, "เปลี่ยนบทบาทหรือปิดบัญชีของตัวเองไม่ได้ — ให้เจ้าของอีกคนทำ");
    if (wouldLeaveNoOwner(cid, u.id, r.ok)) return bad(res, 409, "ต้องมีเจ้าของคลินิกที่ใช้งานได้อย่างน้อย 1 คน");
    const changes = [u.role !== r.ok.role && `role ${u.role}→${r.ok.role}`, isActive(u) !== isActive(r.ok) && (isActive(r.ok) ? "enable" : "disable")].filter(Boolean);
    Object.assign(u, { active: undefined }, r.ok);
    save();
    audit({ ...ctx(req), action: "SETTINGS", target: `user:${u.id}${changes.length ? `:${changes.join(",")}` : ""}` });
    res.json(u);
  });
}
