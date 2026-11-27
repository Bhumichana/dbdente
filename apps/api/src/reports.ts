/**
 * Dashboard รายได้และการดำเนินงาน (Phase 3)
 * เจ้าของเห็นทั้งคลินิก · ทันตแพทย์เห็นเฉพาะรายได้/นัดของตัวเอง · เคาน์เตอร์ใช้รายงานปิดยอดแทน
 */
import type { Express, Response } from "express";
import { requireRole, type AuthedRequest } from "./auth.js";
import { depositBalance } from "./billing.js";
import { localDate, revenueLines } from "./df.js";
import { onHand } from "./stock.js";
import { getDb } from "./store.js";

const bad = (res: Response, status: number, error: string) => void res.status(status).json({ error });
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

export function registerReportRoutes(app: Express) {
  app.get("/api/reports/summary", requireRole("owner", "dentist"), (req: AuthedRequest, res) => {
    const { from, to } = req.query;
    if (!isDate(from) || !isDate(to) || to < from || daysBetween(from, to) > 366) return bad(res, 400, "ช่วงวันที่ไม่ถูกต้อง (ไม่เกิน 1 ปี)");
    const db = getDb();
    const clinicId = req.user!.clinicId;
    const own = req.user!.role === "dentist" ? req.user!.id : undefined;
    const mine = <T extends { dentistId?: string }>(x: T) => !own || x.dentistId === own;

    const lines = revenueLines(clinicId, from, to).filter(mine);
    const len = daysBetween(from, to) + 1;
    const prevTo = addDays(from, -1);
    const prev = revenueLines(clinicId, addDays(prevTo, -(len - 1)), prevTo).filter(mine);

    const byDay = Array.from({ length: len }, (_, i) => ({ date: addDays(from, i), revenue: 0 }));
    for (const l of lines) byDay[daysBetween(from, l.date)].revenue += l.net;

    const group = (key: (l: (typeof lines)[number]) => string) => {
      const m = new Map<string, number>();
      for (const l of lines) m.set(key(l), (m.get(key(l)) ?? 0) + l.net);
      return [...m].map(([label, revenue]) => ({ label, revenue })).sort((a, b) => b.revenue - a.revenue);
    };
    const userName = (id?: string) => db.users.find((u) => u.id === id)?.name ?? "ไม่ระบุ";

    const appts = db.appointments.filter((a) => a.clinicId === clinicId && mine(a) && a.start.slice(0, 10) >= from && a.start.slice(0, 10) <= to);
    const done = appts.filter((a) => a.status === "done").length;
    const noShow = appts.filter((a) => a.status === "no_show").length;
    const visitPatients = new Set(appts.filter((a) => a.status === "done").map((a) => a.patientId));
    const newPatients = db.patients.filter(
      (p) => p.clinicId === clinicId && p.createdAt && localDate(p.createdAt) >= from && localDate(p.createdAt) <= to && (!own || visitPatients.has(p.id)),
    ).length;
    const revenue = lines.reduce((s, l) => s + l.net, 0);

    res.json({
      from,
      to,
      scope: own ? "self" : "clinic",
      kpis: {
        revenue,
        prevRevenue: prev.reduce((s, l) => s + l.net, 0),
        visits: done,
        avgPerVisit: done ? Math.round(revenue / done) : 0,
        newPatients,
        noShow,
        showRate: done + noShow ? done / (done + noShow) : null,
      },
      byDay,
      byDentist: own ? [] : group((l) => userName(l.dentistId)),
      byCategory: group((l) => l.category),
      topProcedures: group((l) => l.name).slice(0, 8),
      // สิ่งที่ต้องติดตาม (เจ้าของเท่านั้น)
      watch: own
        ? undefined
        : {
            outstanding: db.invoices.filter((i) => i.clinicId === clinicId && i.status === "draft").reduce((s, i) => s + i.total, 0),
            deposits: [...new Set(db.invoices.filter((i) => i.clinicId === clinicId && i.kind === "deposit").map((i) => i.patientId))].reduce(
              (s, pid) => s + Math.max(0, depositBalance(pid)),
              0,
            ),
            labOverdue: db.labCases.filter((c) => c.clinicId === clinicId && (c.status === "sent" || c.status === "remake") && c.dueDate < localDate(new Date().toISOString())).length,
            stockLow: db.stockItems.filter((i) => i.clinicId === clinicId && onHand(i) <= i.reorderPoint).length,
          },
    });
  });
}
