/**
 * สต็อกวัสดุ (Phase 3): รับเข้าเป็นล็อต (มีวันหมดอายุ) · ตัดเบิกแบบ FEFO (หมดอายุก่อน ออกก่อน)
 * ตัดอัตโนมัติตามหัตถการเมื่อรับชำระ และคืนสต็อกเมื่อยกเลิกใบเสร็จ
 */
import crypto from "node:crypto";
import type { Express, Response } from "express";
import { requireRole, type AuthedRequest } from "./auth.js";
import type { Invoice, StockItem, StockMove } from "./domain.js";
import { audit, getDb, save } from "./store.js";

const TZ = "Asia/Bangkok";
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const ctx = (req: AuthedRequest) => ({ userId: req.user!.id, clinicId: req.user!.clinicId, ip: req.ip });
const bad = (res: Response, status: number, error: string) => void res.status(status).json({ error });

export const EXPIRY_WARN_DAYS = 60;
export const onHand = (it: StockItem) => round2(it.lots.reduce((s, l) => s + l.qty, 0));

function itemView(it: StockItem) {
  const t = today();
  const soon = addDays(t, EXPIRY_WARN_DAYS);
  const qty = onHand(it);
  const lots = [...it.lots].sort((a, b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"));
  return {
    ...it,
    lots,
    onHand: qty,
    low: qty <= it.reorderPoint,
    expired: round2(lots.filter((l) => l.expiry && l.expiry < t).reduce((s, l) => s + l.qty, 0)),
    expiringSoon: round2(lots.filter((l) => l.expiry && l.expiry >= t && l.expiry <= soon).reduce((s, l) => s + l.qty, 0)),
    nextExpiry: lots.find((l) => l.expiry && l.expiry >= t)?.expiry,
  };
}

/** ตัดจากล็อตที่หมดอายุก่อน (ข้ามล็อตที่หมดอายุแล้ว) · คืนจำนวนที่ตัดไม่ได้ */
function takeFefo(it: StockItem, qty: number) {
  const t = today();
  let left = qty;
  const used: { lot: string; qty: number }[] = [];
  const usable = it.lots.filter((l) => l.qty > 0 && (!l.expiry || l.expiry >= t)).sort((a, b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"));
  for (const l of usable) {
    if (left <= 0) break;
    const n = round2(Math.min(l.qty, left));
    l.qty = round2(l.qty - n);
    left = round2(left - n);
    used.push({ lot: l.lot, qty: n });
  }
  it.lots = it.lots.filter((l) => l.qty > 0);
  return { used, shortage: left };
}

function move(m: Omit<StockMove, "id" | "at">): StockMove {
  const full = { id: crypto.randomUUID(), at: new Date().toISOString(), ...m };
  getDb().stockMoves.push(full);
  return full;
}

/** ตัดสต็อกตามวัสดุของหัตถการในบิลที่ชำระแล้ว */
export function deductForInvoice(inv: Invoice, userId: string) {
  const db = getDb();
  const need = new Map<string, number>();
  for (const i of inv.items) {
    const p = db.procedures.find((x) => x.id === i.procedureId);
    for (const m of p?.materials ?? []) need.set(m.itemId, round2((need.get(m.itemId) ?? 0) + m.qty * i.qty));
  }
  for (const [itemId, qty] of need) {
    const it = db.stockItems.find((x) => x.id === itemId && x.clinicId === inv.clinicId);
    if (!it || qty <= 0) continue;
    const { used, shortage } = takeFefo(it, qty);
    move({
      clinicId: inv.clinicId,
      itemId,
      type: "out",
      qty: -round2(qty - shortage),
      lot: used.map((u) => u.lot).join(", ") || undefined,
      reason: `ตัดตามหัตถการ ${inv.receiptNo ?? ""}`.trim(),
      ref: inv.id,
      shortage: shortage > 0 ? shortage : undefined,
      by: userId,
    });
  }
}

/** ยกเลิกใบเสร็จ → คืนวัสดุที่ตัดไป (เป็นล็อต "คืนจากยกเลิก" ไม่มีวันหมดอายุ) */
export function reverseForInvoice(inv: Invoice, userId: string) {
  const db = getDb();
  for (const m of db.stockMoves.filter((x) => x.ref === inv.id && x.type === "out")) {
    const it = db.stockItems.find((x) => x.id === m.itemId);
    if (!it || m.qty === 0) continue;
    const back = -m.qty;
    const lot = m.lot?.split(", ")[0] ?? "คืน";
    const existing = it.lots.find((l) => l.lot === lot);
    if (existing) existing.qty = round2(existing.qty + back);
    else it.lots.push({ id: crypto.randomUUID(), lot, qty: back });
    move({ clinicId: inv.clinicId, itemId: it.id, type: "in", qty: back, lot, reason: `คืนจากยกเลิก ${inv.receiptNo}`, ref: inv.id, by: userId });
  }
}

const userName = (id: string) => getDb().users.find((u) => u.id === id)?.name;

export function registerStockRoutes(app: Express) {
  const ROLES = ["owner", "assistant"] as const;

  app.get("/api/stock", requireRole(...ROLES), (req: AuthedRequest, res) => {
    const db = getDb();
    const items = db.stockItems.filter((i) => i.clinicId === req.user!.clinicId);
    const names = Object.fromEntries(items.map((i) => [i.id, i.name]));
    res.json({
      items: items.map(itemView).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
      moves: db.stockMoves
        .filter((m) => m.clinicId === req.user!.clinicId)
        .slice(-60)
        .reverse()
        .map((m) => ({ ...m, itemName: names[m.itemId], byName: userName(m.by) })),
    });
  });

  const find = (req: AuthedRequest) => getDb().stockItems.find((i) => i.id === req.params.id && i.clinicId === req.user!.clinicId);
  const qtyOf = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= 100000 ? round2(n) : null;
  };

  app.post("/api/stock/:id/in", requireRole(...ROLES), (req: AuthedRequest, res) => {
    const it = find(req);
    if (!it) return bad(res, 404, "ไม่พบรายการ");
    const qty = qtyOf(req.body?.qty);
    if (!qty) return bad(res, 400, "จำนวนไม่ถูกต้อง");
    const lot = String(req.body?.lot ?? "").trim().slice(0, 40) || `IN-${today()}`;
    const expiry = String(req.body?.expiry ?? "");
    if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return bad(res, 400, "วันหมดอายุไม่ถูกต้อง");
    const same = it.lots.find((l) => l.lot === lot && (l.expiry ?? "") === expiry);
    if (same) same.qty = round2(same.qty + qty);
    else it.lots.push({ id: crypto.randomUUID(), lot, expiry: expiry || undefined, qty });
    move({ clinicId: it.clinicId, itemId: it.id, type: "in", qty, lot, reason: String(req.body?.reason ?? "").trim().slice(0, 200) || "รับเข้า", by: req.user!.id });
    save();
    audit({ ...ctx(req), action: "STOCK_MOVE", target: `${it.code}:+${qty}` });
    res.json(itemView(it));
  });

  app.post("/api/stock/:id/out", requireRole(...ROLES), (req: AuthedRequest, res) => {
    const it = find(req);
    if (!it) return bad(res, 404, "ไม่พบรายการ");
    const qty = qtyOf(req.body?.qty);
    if (!qty) return bad(res, 400, "จำนวนไม่ถูกต้อง");
    const reason = String(req.body?.reason ?? "").trim().slice(0, 200);
    if (!reason) return bad(res, 400, "ระบุเหตุผลการเบิก");
    // ตรวจก่อนตัด (ไม่นับล็อตที่หมดอายุ) — กันการตัดไปครึ่งทางแล้วค่อยปฏิเสธ
    const usable = round2(it.lots.filter((l) => !l.expiry || l.expiry >= today()).reduce((s, l) => s + l.qty, 0));
    if (qty > usable) return bad(res, 409, `ของที่ยังไม่หมดอายุเหลือ ${usable} ${it.unit} ไม่พอเบิก`);
    const { used } = takeFefo(it, qty);
    move({ clinicId: it.clinicId, itemId: it.id, type: "out", qty: -qty, lot: used.map((u) => u.lot).join(", "), reason, by: req.user!.id });
    save();
    audit({ ...ctx(req), action: "STOCK_MOVE", target: `${it.code}:-${qty}` });
    res.json(itemView(it));
  });

  /** ปรับยอดตามการนับจริง (รวมถึงทิ้งล็อตหมดอายุ = นับได้ 0) */
  app.post("/api/stock/:id/adjust", requireRole(...ROLES), (req: AuthedRequest, res) => {
    const it = find(req);
    if (!it) return bad(res, 404, "ไม่พบรายการ");
    const lot = it.lots.find((l) => l.id === req.body?.lotId);
    if (!lot) return bad(res, 404, "ไม่พบล็อต");
    const counted = Number(req.body?.counted);
    if (!Number.isFinite(counted) || counted < 0 || counted > 100000) return bad(res, 400, "จำนวนที่นับได้ไม่ถูกต้อง");
    const reason = String(req.body?.reason ?? "").trim().slice(0, 200);
    if (!reason) return bad(res, 400, "ระบุเหตุผล");
    const diff = round2(counted - lot.qty);
    lot.qty = round2(counted);
    it.lots = it.lots.filter((l) => l.qty > 0);
    move({ clinicId: it.clinicId, itemId: it.id, type: "adjust", qty: diff, lot: lot.lot, reason, by: req.user!.id });
    save();
    audit({ ...ctx(req), action: "STOCK_MOVE", target: `${it.code}:adjust:${diff}` });
    res.json(itemView(it));
  });

  app.put("/api/stock/:id", requireRole("owner"), (req: AuthedRequest, res) => {
    const it = find(req);
    if (!it) return bad(res, 404, "ไม่พบรายการ");
    const rp = Number(req.body?.reorderPoint);
    if (!Number.isFinite(rp) || rp < 0 || rp > 100000) return bad(res, 400, "จุดสั่งซื้อไม่ถูกต้อง");
    it.reorderPoint = round2(rp);
    save();
    res.json(itemView(it));
  });
}
