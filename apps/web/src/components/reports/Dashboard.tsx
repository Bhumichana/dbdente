"use client";

import { AlarmClock, CalendarCheck, FlaskConical, Package, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { api, ApiError } from "@/lib/api";
import { addDays } from "@/lib/clinic";
import { cn } from "@/lib/cn";
import { thaiDate, todayTH } from "@/lib/format";
import { baht } from "@/lib/money";
import { useRole } from "@/lib/session";
import type { ReportSummary } from "@/lib/types";

type Range = "7" | "30" | "month" | "90";
const RANGES: { v: Range; label: string }[] = [
  { v: "7", label: "7 วัน" },
  { v: "30", label: "30 วัน" },
  { v: "month", label: "เดือนนี้" },
  { v: "90", label: "90 วัน" },
];
const rangeOf = (r: Range) => {
  const to = todayTH();
  if (r === "month") return { from: `${to.slice(0, 7)}-01`, to };
  return { from: addDays(to, -(Number(r) - 1)), to };
};
/** ตัวเลขย่อสำหรับแกน/ป้าย: 12,500 → 12.5K */
const short = (satang: number) => {
  const b = satang / 100;
  return b >= 1_000_000 ? `${(b / 1_000_000).toFixed(1)}M` : b >= 1000 ? `${Math.round(b / 100) / 10}K` : String(Math.round(b));
};

/** Dashboard: เจ้าของเห็นทั้งคลินิก · ทันตแพทย์เห็นเฉพาะของตัวเอง · เคาน์เตอร์ใช้รายงานปิดยอด */
export function Dashboard() {
  const role = useRole();
  const [range, setRange] = useState<Range>("30");
  const [data, setData] = useState<ReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { from, to } = rangeOf(range);
  useEffect(() => {
    if (role === "receptionist") return;
    api<ReportSummary>(`/api/reports/summary?from=${from}&to=${to}`).then(setData, (e: ApiError) => setError(e.message));
  }, [from, to, role]);

  if (role === "receptionist")
    return (
      <div className="mx-auto max-w-xl p-6">
        <EmptyState
          icon={<CalendarCheck />}
          title="รายงานของเคาน์เตอร์คือรายงานปิดยอด"
          action={
            <Link href="/billing/close" className={buttonClass()}>
              เปิดรายงานปิดยอด
            </Link>
          }
        >
          ดูยอดรับตามช่องทาง เงินสดในลิ้นชัก และประวัติการปิดยอด
        </EmptyState>
      </div>
    );
  if (error) return <Alert className="m-6">{error}</Alert>;

  const k = data?.kpis;
  const delta = k && k.prevRevenue ? (k.revenue - k.prevRevenue) / k.prevRevenue : null;

  return (
    <div className="mx-auto grid max-w-6xl gap-5 p-4 sm:p-6">
      {/* ตัวกรองแถวเดียวเหนือกราฟ */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="ช่วงเวลา" className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.v}
              role="tab"
              aria-selected={range === r.v}
              onClick={() => setRange(r.v)}
              className={cn("rounded-md px-3 py-1.5 text-sm", range === r.v ? "bg-navy-700 font-medium text-white" : "text-ink-600 hover:bg-navy-50")}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-ink-500">
          {thaiDate(from)} – {thaiDate(to)}
          {data?.scope === "self" && " · เฉพาะเคสของคุณ"}
        </span>
      </div>

      {!data || !k ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="col-span-2 grid gap-1 px-5 py-4 lg:col-span-1">
              <span className="text-xs text-ink-500">รายได้ค่ารักษา</span>
              <span className="font-mono text-3xl font-medium text-navy-900">฿{baht(k.revenue).replace(/\.00$/, "")}</span>
              {delta !== null && (
                <span className={cn("text-xs", delta >= 0 ? "text-success" : "text-danger")}>
                  {delta >= 0 ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(1)}% จากช่วงก่อนหน้า
                </span>
              )}
            </Card>
            <Tile label="Visit ที่รักษาเสร็จ" value={k.visits.toLocaleString("th-TH")} sub={`เฉลี่ย ฿${baht(k.avgPerVisit).replace(/\.00$/, "")} / visit`} />
            <Tile label={data.scope === "self" ? "คนไข้ใหม่ที่ฉันรักษา" : "คนไข้ใหม่"} value={k.newPatients.toLocaleString("th-TH")} />
            <Tile
              label="อัตรามาตามนัด"
              value={k.showRate == null ? "—" : `${(k.showRate * 100).toFixed(1)}%`}
              sub={`ไม่มาตามนัด ${k.noShow} ราย`}
              warn={k.showRate != null && k.showRate < 0.85}
            />
          </div>

          {data.watch && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Watch href="/billing" icon={<AlarmClock />} label="บิลรอชำระ" value={`฿${baht(data.watch.outstanding)}`} on={data.watch.outstanding > 0} />
              <Watch href="/installments" icon={<Wallet />} label="มัดจำคงเหลือของคนไข้" value={`฿${baht(data.watch.deposits)}`} on={false} />
              <Watch href="/lab" icon={<FlaskConical />} label="งานแล็บเลยกำหนด" value={String(data.watch.labOverdue)} on={data.watch.labOverdue > 0} />
              <Watch href="/stock" icon={<Package />} label="วัสดุต่ำกว่าจุดสั่งซื้อ" value={String(data.watch.stockLow)} on={data.watch.stockLow > 0} />
            </div>
          )}

          <Card>
            <CardHeader title="รายได้รายวัน" description="ค่ารักษาจากใบเสร็จที่ชำระแล้ว (ไม่รวมรับมัดจำ)" />
            <DailyBars days={data.byDay} />
          </Card>

          <div className={cn("grid gap-5", data.byDentist.length > 0 && "lg:grid-cols-2")}>
            {data.byDentist.length > 0 && (
              <Card>
                <CardHeader title="รายได้ตามทันตแพทย์" />
                <RankBars rows={data.byDentist} total={k.revenue} />
              </Card>
            )}
            <Card>
              <CardHeader title="รายได้ตามหมวดหัตถการ" />
              <RankBars rows={data.byCategory} total={k.revenue} />
            </Card>
          </div>
          <Card>
            <CardHeader title="หัตถการที่ทำรายได้สูงสุด" />
            <RankBars rows={data.topProcedures} total={k.revenue} />
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <Card className="grid gap-1 px-5 py-4">
      <span className="text-xs text-ink-500">{label}</span>
      <span className={cn("font-mono text-2xl", warn ? "text-warning" : "text-ink-900")}>{value}</span>
      {sub && <span className="text-xs text-ink-500">{sub}</span>}
    </Card>
  );
}

function Watch({ href, icon, label, value, on }: { href: string; icon: React.ReactNode; label: string; value: string; on: boolean }) {
  return (
    <Link href={href} className={cn("flex items-center gap-3 rounded-xl border bg-white px-4 py-3 hover:border-navy-300", on ? "border-warning" : "border-ink-200")}>
      <span className={cn("[&_svg]:size-5", on ? "text-warning" : "text-ink-400")}>{icon}</span>
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-xs text-ink-500">{label}</span>
        <span className="font-mono text-lg text-ink-900">{value}</span>
      </span>
    </Link>
  );
}

/** แท่งรายวัน (สีเดียว) · แกน y เดียว · เส้นกริดจาง · ชี้/แตะเพื่อดูค่า · มีตารางให้ดูแทนได้ */
function DailyBars({ days }: { days: { date: string; revenue: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...days.map((d) => d.revenue), 1);
  // เพดานแกนปัดขึ้นเป็นเลขกลมๆ
  const step = 10 ** Math.floor(Math.log10(max / 100)) * 100;
  const top = Math.ceil(max / step / 4) * step * 4;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const W = 900;
  const H = 240;
  const padL = 44;
  const padB = 24;
  const padT = 12;
  const bw = (W - padL) / days.length;
  const y = (v: number) => padT + (H - padB - padT) * (1 - v / top);
  const labelEvery = Math.ceil(days.length / 10);
  const h = hover != null ? days[hover] : null;

  return (
    <div className="grid gap-2 p-4">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="กราฟแท่งรายได้รายวัน" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="stroke-ink-100" strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-400 font-mono text-[10px]">
                {short(t)}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const x = padL + i * bw;
            const barW = Math.max(1, bw - 2); // ช่องว่าง 2px ระหว่างแท่ง
            const bh = (H - padB) - y(d.revenue);
            const r = Math.min(4, barW / 2, bh);
            const yTop = y(d.revenue);
            return (
              <g key={d.date}>
                {d.revenue > 0 && (
                  // มุมโค้งเฉพาะด้านบน ฐานติดแกน
                  <path
                    d={`M${x + 1},${H - padB} V${yTop + r} Q${x + 1},${yTop} ${x + 1 + r},${yTop} H${x + 1 + barW - r} Q${x + 1 + barW},${yTop} ${x + 1 + barW},${yTop + r} V${H - padB} Z`}
                    className={cn(hover === i ? "fill-teal-700" : "fill-teal-500")}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="fill-ink-400 font-mono text-[10px]">
                    {Number(d.date.slice(8))}
                  </text>
                )}
                {/* พื้นที่ชี้ใหญ่กว่าแท่ง */}
                <rect x={x} y={0} width={bw} height={H - padB} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
        {h && hover != null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs shadow-md"
            style={{ left: `${((padL + (hover + 0.5) * bw) / W) * 100}%` }}
          >
            <div className="text-ink-500">{thaiDate(h.date, { weekday: "short", day: "numeric", month: "short" })}</div>
            <div className="font-mono text-sm text-ink-900">฿{baht(h.revenue)}</div>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-teal-700">ดูเป็นตาราง</summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full">
            <tbody className="divide-y divide-ink-100">
              {days.map((d) => (
                <tr key={d.date}>
                  <td className="py-1 pr-4">{thaiDate(d.date, { weekday: "short", day: "numeric", month: "short" })}</td>
                  <td className="py-1 text-right font-mono">{baht(d.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** แท่งแนวนอนเรียงจากมากไปน้อย (สีเดียว — ป้ายชื่อบอกตัวตน ไม่ใช้สีแยก) */
function RankBars({ rows, total }: { rows: { label: string; revenue: number }[]; total: number }) {
  const max = Math.max(...rows.map((r) => r.revenue), 1);
  if (!rows.length) return <p className="px-4 py-6 text-sm text-ink-400">ยังไม่มีข้อมูลในช่วงนี้</p>;
  return (
    <ul className="grid gap-2.5 p-4">
      {rows.map((r) => (
        <li key={r.label} className="grid gap-1" title={`${r.label}: ฿${baht(r.revenue)}`}>
          <div className="flex items-baseline gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink-800">{r.label}</span>
            <span className="font-mono text-ink-900">฿{baht(r.revenue).replace(/\.00$/, "")}</span>
            <span className="w-12 text-right font-mono text-xs text-ink-500">{total ? `${Math.round((r.revenue / total) * 100)}%` : ""}</span>
          </div>
          <div className="h-2 rounded-r bg-ink-100/60">
            <div className="h-2 rounded-r bg-teal-500" style={{ width: `${(r.revenue / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
