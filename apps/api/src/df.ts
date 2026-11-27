/**
 * ค่ามือหมอ (DF) — Phase 2
 * ต่อรายการในใบเสร็จ: ฐาน = ยอดสุทธิ − ค่าวัสดุ − ค่าแล็บที่ผูกกับรายการ · DF = ฐาน × % ตามหมวดหัตถการ
 * ต่อวัน: ถ้า DF รวมของวันที่เข้าเวรต่ำกว่าประกันขั้นต่ำ → จ่ายเพิ่มให้ถึงขั้นต่ำ
 * ทันตแพทย์เห็นเฉพาะของตัวเอง
 */
import type { Express, Response } from "express";
import { requireRole, type AuthedRequest } from "./auth.js";
import type { DfRule } from "./domain.js";
import { audit, getDb, save } from "./store.js";

const TZ = "Asia/Bangkok";
export const localDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
const ctx = (req: AuthedRequest) => ({ userId: req.user!.id, clinicId: req.user!.clinicId, ip: req.ip });
const bad = (res: Response, status: number, error: string) => void res.status(status).json({ error });

export interface RevenueLine {
  date: string;
  invoiceId: string;
  receiptNo?: string;
  itemId: string;
  patientId: string;
  patientName?: string;
  dentistId?: string;
  procedureId?: string;
  category: string;
  name: string;
  net: number;
  materialCost: number;
  labCost: number;
}

/** รายการรายได้จากใบเสร็จที่ชำระแล้ว (ไม่รวมใบรับมัดจำ — มัดจำนับเป็นรายได้ตอนถูกใช้จ่ายบิล) */
export function revenueLines(clinicId: string, from: string, to: string): RevenueLine[] {
  const db = getDb();
  const labByItem = new Map<string, number>();
  for (const c of db.labCases) if (c.clinicId === clinicId && c.invoiceItemId && c.status !== "cancelled") labByItem.set(c.invoiceItemId, (labByItem.get(c.invoiceItemId) ?? 0) + c.cost);
  const out: RevenueLine[] = [];
  for (const inv of db.invoices) {
    if (inv.clinicId !== clinicId || inv.status !== "paid" || inv.kind === "deposit" || !inv.paidAt) continue;
    const date = localDate(inv.paidAt);
    if (date < from || date > to) continue;
    const patientName = db.patients.find((p) => p.id === inv.patientId)?.fullName;
    for (const i of inv.items) {
      const p = db.procedures.find((x) => x.id === i.procedureId);
      out.push({
        date,
        invoiceId: inv.id,
        receiptNo: inv.receiptNo,
        itemId: i.id,
        patientId: inv.patientId,
        patientName,
        dentistId: i.dentistId,
        procedureId: i.procedureId,
        category: p?.category ?? "อื่นๆ",
        name: i.name,
        net: i.qty * i.unitPrice - i.discount,
        materialCost: (p?.materialCost ?? 0) * i.qty,
        labCost: labByItem.get(i.id) ?? 0,
      });
    }
  }
  return out;
}

export const defaultRule = (clinicId: string, dentistId: string): DfRule => ({
  clinicId,
  dentistId,
  defaultPercent: 40,
  byCategory: {},
  dailyMinimum: 0,
  updatedAt: "",
  updatedBy: "",
});

export const ruleOf = (clinicId: string, dentistId: string) =>
  getDb().dfRules.find((r) => r.clinicId === clinicId && r.dentistId === dentistId) ?? defaultRule(clinicId, dentistId);

const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
};

export function computeDf(clinicId: string, month: string, dentistId: string, rule = ruleOf(clinicId, dentistId)) {
  const db = getDb();
  const { from, to } = monthRange(month);
  const lines = revenueLines(clinicId, from, to)
    .filter((l) => l.dentistId === dentistId)
    .map((l) => {
      const base = Math.max(0, l.net - l.materialCost - l.labCost);
      const percent = rule.byCategory[l.category] ?? rule.defaultPercent;
      return { ...l, base, percent, df: Math.round((base * percent) / 100) };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  // วันที่เข้าเวร = มีใบเสร็จ หรือมีนัดที่รักษาเสร็จ
  const worked = new Set(lines.map((l) => l.date));
  for (const a of db.appointments)
    if (a.clinicId === clinicId && a.dentistId === dentistId && a.status === "done" && a.start.slice(0, 10) >= from && a.start.slice(0, 10) <= to) worked.add(a.start.slice(0, 10));
  const days = [...worked].sort().map((date) => {
    const ls = lines.filter((l) => l.date === date);
    const df = ls.reduce((s, l) => s + l.df, 0);
    return {
      date,
      revenue: ls.reduce((s, l) => s + l.net, 0),
      df,
      topUp: rule.dailyMinimum > df ? rule.dailyMinimum - df : 0,
    };
  });
  const sum = (k: "net" | "materialCost" | "labCost" | "df") => lines.reduce((s, l) => s + l[k], 0);
  const topUp = days.reduce((s, d) => s + d.topUp, 0);
  return {
    dentistId,
    name: db.users.find((u) => u.id === dentistId)?.name,
    rule,
    revenue: sum("net"),
    materialCost: sum("materialCost"),
    labCost: sum("labCost"),
    df: sum("df"),
    topUp,
    total: sum("df") + topUp,
    days,
    lines,
  };
}

const dentistsOf = (clinicId: string) => getDb().users.filter((u) => u.clinicId === clinicId && (u.role === "dentist" || u.role === "owner"));
const categories = (clinicId: string) => [...new Set(getDb().procedures.filter((p) => p.clinicId === clinicId).map((p) => p.category))];

function parseRule(body: Record<string, unknown>, clinicId: string): { ok: Pick<DfRule, "defaultPercent" | "byCategory" | "dailyMinimum"> } | { error: string } {
  const pct = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 10) / 10 : null;
  };
  const defaultPercent = pct(body.defaultPercent);
  if (defaultPercent === null) return { error: "% ต้องอยู่ระหว่าง 0–100" };
  const cats = categories(clinicId);
  const byCategory: Record<string, number> = {};
  for (const [k, v] of Object.entries((body.byCategory ?? {}) as Record<string, unknown>)) {
    if (!cats.includes(k) || v === "" || v == null) continue;
    const p = pct(v);
    if (p === null) return { error: `% ของหมวด ${k} ไม่ถูกต้อง` };
    byCategory[k] = p;
  }
  const dailyMinimum = Number(body.dailyMinimum ?? 0);
  if (!Number.isInteger(dailyMinimum) || dailyMinimum < 0 || dailyMinimum > 10_000_000) return { error: "ประกันขั้นต่ำไม่ถูกต้อง" };
  return { ok: { defaultPercent, byCategory, dailyMinimum } };
}

const validMonth = (m: unknown): m is string => typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export function registerDfRoutes(app: Express) {
  app.get("/api/df/rules", requireRole("owner"), (req: AuthedRequest, res) => {
    const clinicId = req.user!.clinicId;
    res.json({ categories: categories(clinicId), rules: dentistsOf(clinicId).map((d) => ({ ...ruleOf(clinicId, d.id), name: d.name })) });
  });

  app.put("/api/df/rules/:dentistId", requireRole("owner"), (req: AuthedRequest, res) => {
    const clinicId = req.user!.clinicId;
    const d = dentistsOf(clinicId).find((u) => u.id === req.params.dentistId);
    if (!d) return bad(res, 404, "ไม่พบทันตแพทย์");
    const r = parseRule(req.body ?? {}, clinicId);
    if ("error" in r) return bad(res, 400, r.error);
    const db = getDb();
    const rule: DfRule = { clinicId, dentistId: d.id, ...r.ok, updatedAt: new Date().toISOString(), updatedBy: req.user!.id };
    db.dfRules = [...db.dfRules.filter((x) => !(x.clinicId === clinicId && x.dentistId === d.id)), rule];
    save();
    audit({ ...ctx(req), action: "DF_RULE", target: `${d.id}:${r.ok.defaultPercent}` });
    res.json({ ...rule, name: d.name });
  });

  /** ทดลองคำนวณด้วยกฎที่ยังไม่บันทึก */
  app.post("/api/df/preview", requireRole("owner"), (req: AuthedRequest, res) => {
    const clinicId = req.user!.clinicId;
    const d = dentistsOf(clinicId).find((u) => u.id === req.body?.dentistId);
    if (!d) return bad(res, 404, "ไม่พบทันตแพทย์");
    if (!validMonth(req.body?.month)) return bad(res, 400, "เดือนไม่ถูกต้อง");
    const r = parseRule(req.body?.rule ?? {}, clinicId);
    if ("error" in r) return bad(res, 400, r.error);
    const { lines: _lines, ...summary } = computeDf(clinicId, req.body.month, d.id, { ...ruleOf(clinicId, d.id), ...r.ok });
    res.json(summary);
  });

  /** สรุป DF รายเดือน · เจ้าของเห็นทุกคน (ระบุ dentistId เพื่อดูรายเคส) · ทันตแพทย์เห็นเฉพาะตัวเอง */
  app.get("/api/df", requireRole("owner", "dentist"), (req: AuthedRequest, res) => {
    const clinicId = req.user!.clinicId;
    const month = req.query.month;
    if (!validMonth(month)) return bad(res, 400, "เดือนไม่ถูกต้อง");
    const self = req.user!.role === "dentist";
    const only = self ? req.user!.id : (req.query.dentistId as string | undefined);
    const list = dentistsOf(clinicId)
      .filter((d) => !only || d.id === only)
      .map((d) => {
        const r = computeDf(clinicId, month, d.id);
        return only ? r : { ...r, lines: undefined };
      });
    audit({ ...ctx(req), action: "VIEW_DF", target: `${month}:${only ?? "all"}` });
    res.json({ month, dentists: list });
  });

  /** ส่งออก CSV (เปิดใน Excel ภาษาไทยได้ — มี BOM) */
  app.get("/api/df/export", requireRole("owner", "dentist"), (req: AuthedRequest, res) => {
    const clinicId = req.user!.clinicId;
    const month = req.query.month;
    if (!validMonth(month)) return bad(res, 400, "เดือนไม่ถูกต้อง");
    const only = req.user!.role === "dentist" ? req.user!.id : (req.query.dentistId as string | undefined);
    const baht = (s: number) => (s / 100).toFixed(2);
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["วันที่", "ทันตแพทย์", "ใบเสร็จ", "คนไข้", "รายการ", "หมวด", "ยอดสุทธิ", "ค่าวัสดุ", "ค่าแล็บ", "ฐานคำนวณ", "%", "DF"]];
    for (const d of dentistsOf(clinicId).filter((x) => !only || x.id === only)) {
      const r = computeDf(clinicId, month, d.id);
      for (const l of r.lines)
        rows.push([l.date, d.name, l.receiptNo ?? "", l.patientName ?? "", l.name, l.category, baht(l.net), baht(l.materialCost), baht(l.labCost), baht(l.base), String(l.percent), baht(l.df)]);
      for (const day of r.days.filter((x) => x.topUp > 0))
        rows.push([day.date, d.name, "", "", "ประกันรายได้ขั้นต่ำ (จ่ายเพิ่ม)", "", "", "", "", "", "", baht(day.topUp)]);
    }
    audit({ ...ctx(req), action: "VIEW_DF", target: `${month}:${only ?? "all"}:csv` });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="df-${month}.csv"`);
    res.send("﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n"));
  });
}
