"use client";

import { ArrowLeft, Banknote, CalendarCheck, Landmark, Printer, Receipt } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { thaiDate } from "@/lib/format";
import { baht } from "@/lib/money";
import { useSocketEvent } from "@/lib/realtime";
import { PAYMENT_METHOD, type DayClose as Close, type InvoiceSummary, type Payment, type PaymentMethod } from "@/lib/types";
import { MoneyInput } from "./inputs";

interface Summary {
  receiptCount: number;
  voidCount: number;
  total: number;
  byMethod: Record<PaymentMethod, number>;
  since?: string;
  receipts: (InvoiceSummary & { payments: Payment[] })[];
  history: Close[];
}

const time = (iso: string) => thaiDate(iso, { hour: "2-digit", minute: "2-digit" });
const when = (iso: string) => thaiDate(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** ปิดยอด (ปิดกะ): รวมใบเสร็จที่ยังไม่ปิด → นับเงินสดในลิ้นชัก → บันทึกส่วนต่าง */
export function DayClose() {
  const [s, setS] = useState<Summary | null>(null);
  const [float, setFloat] = useState(0);
  const [counted, setCounted] = useState(0);
  const [countedSet, setCountedSet] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Close | null>(null);

  const load = useCallback(() => api<Summary>("/api/billing/close").then(setS), []);
  useEffect(() => {
    load();
  }, [load]);
  useSocketEvent("billing:changed", load, load);

  if (!s) return <Skeleton className="m-6 h-96" />;

  const expected = float + s.byMethod.cash;
  const diff = counted - expected;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const c = await api<Close>("/api/billing/close", { method: "POST", body: JSON.stringify({ float, cashCounted: counted, note }) });
      setDone(c);
      setCounted(0);
      setCountedSet(false);
      setNote("");
      toast("ปิดยอดเรียบร้อย");
      load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-5 p-4 sm:p-6 print:p-0">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/billing" className={buttonClass("ghost", "sm")}>
          <ArrowLeft />
          รับชำระเงิน
        </Link>
        <span className="flex-1" />
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer />
          พิมพ์สรุป
        </Button>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-ink-900">ปิดยอดประจำวัน</h1>
        <p className="text-sm text-ink-500">
          ใบเสร็จที่ยังไม่ปิดยอด{s.since ? ` ตั้งแต่ปิดรอบก่อน (${when(s.since)})` : ""} · ปิดได้หลายรอบต่อวัน (เช่น ปิดกะเช้า/เย็น)
        </p>
      </div>

      {done && (
        <Alert tone={done.diff === 0 ? "info" : "warning"}>
          ปิดยอดแล้ว {when(done.closedAt)} โดย {done.closedByName} · รวม ฿{baht(done.total)} ({done.receiptCount} ใบ) · เงินสดส่วนต่าง{" "}
          <span className="font-mono">{done.diff > 0 ? "+" : ""}{baht(done.diff)}</span>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Receipt />} label="ใบเสร็จ" value={String(s.receiptCount)} sub={s.voidCount ? `ยกเลิก ${s.voidCount} ใบ` : undefined} />
        <Kpi label="ยอดรวม" value={`฿${baht(s.total)}`} strong />
        <Kpi icon={<Banknote />} label="เงินสด" value={`฿${baht(s.byMethod.cash)}`} />
        <Kpi
          icon={<Landmark />}
          label="โอน / บัตร"
          value={`฿${baht(s.byMethod.transfer + (s.byMethod.card ?? 0))}`}
          sub={s.byMethod.card ? `บัตร ฿${baht(s.byMethod.card)}` : undefined}
          subTone="muted"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {s.receipts.length ? (
          <Table>
            <THead>
              <tr>
                <TH>เวลา</TH>
                <TH>เลขที่</TH>
                <TH>คนไข้</TH>
                <TH>ช่องทาง</TH>
                <TH className="text-right">จำนวนเงิน</TH>
              </tr>
            </THead>
            <TBody>
              {s.receipts.map((r) => (
                <tr key={r.id} className={cn(r.status === "void" && "text-ink-400")}>
                  <TD className="font-mono">{r.paidAt && time(r.paidAt)}</TD>
                  <TD>
                    <Link href={`/billing/receipt/${r.id}`} className={cn("font-mono hover:underline", r.status === "void" && "line-through")}>
                      {r.receiptNo}
                    </Link>
                  </TD>
                  <TD className="max-w-48 truncate">{r.patient?.fullName}</TD>
                  <TD>
                    {r.status === "void" ? <Badge>ยกเลิก</Badge> : r.payments.map((p) => PAYMENT_METHOD[p.method].split(" ")[0]).join(" + ")}
                  </TD>
                  <TD num className={cn(r.status === "void" && "line-through")}>
                    {baht(r.total)}
                  </TD>
                </tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={<CalendarCheck />} title="ไม่มีใบเสร็จที่รอปิดยอด">
            ใบเสร็จทุกใบถูกปิดยอดแล้ว
          </EmptyState>
        )}

        <Card className="grid gap-3 p-4 print:hidden">
          <h2 className="font-semibold text-ink-900">นับเงินสดในลิ้นชัก</h2>
          <Field label="เงินทอนตั้งต้น (ก่อนเปิดกะ)">
            {(p) => <MoneyInput {...p} value={float} blankZero placeholder="0.00" onValue={setFloat} />}
          </Field>
          <div className="flex justify-between text-sm">
            <span className="text-ink-600">เงินสดที่ควรมี</span>
            <span className="font-mono">{baht(expected)}</span>
          </div>
          <Field label="นับได้จริง">
            {(p) => (
              <MoneyInput
                {...p}
                value={counted}
                blankZero
                placeholder="0.00"
                onValue={(v) => {
                  setCounted(v);
                  setCountedSet(true);
                }}
              />
            )}
          </Field>
          {countedSet && (
            <div
              role="status"
              className={cn(
                "flex justify-between rounded-lg px-3 py-2 text-sm font-semibold",
                diff === 0 ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
              )}
            >
              {diff === 0 ? "ยอดตรง" : diff > 0 ? "เงินเกิน" : "เงินขาด"}
              <span className="font-mono">
                {diff > 0 ? "+" : ""}
                {baht(diff)}
              </span>
            </div>
          )}
          <Field label={diff !== 0 && countedSet ? "หมายเหตุ (จำเป็นเมื่อยอดไม่ตรง)" : "หมายเหตุ"}>
            {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />}
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button
            size="lg"
            disabled={busy || !countedSet || !s.receipts.length || (diff !== 0 && !note.trim())}
            onClick={submit}
          >
            <CalendarCheck />
            ยืนยันปิดยอด
          </Button>
          <p className="text-xs text-ink-500">หลังปิดยอด ใบเสร็จในรอบนี้ยกเลิกไม่ได้</p>
        </Card>
      </div>

      {s.history.length > 0 && (
        <Card>
          <CardHeader title="ประวัติการปิดยอด" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-left text-xs text-ink-500">
                <tr>
                  <th className="px-4 py-2 font-medium">ปิดเมื่อ</th>
                  <th className="px-4 py-2 font-medium">ผู้ปิด</th>
                  <th className="px-4 py-2 text-right font-medium">ใบ</th>
                  <th className="px-4 py-2 text-right font-medium">เงินสด</th>
                  <th className="px-4 py-2 text-right font-medium">โอน/บัตร</th>
                  <th className="px-4 py-2 text-right font-medium">รวม</th>
                  <th className="px-4 py-2 text-right font-medium">ส่วนต่าง</th>
                  <th className="px-4 py-2 font-medium">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {s.history.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2 whitespace-nowrap">{when(c.closedAt)}</td>
                    <td className="px-4 py-2">{c.closedByName}</td>
                    <td className="px-4 py-2 text-right font-mono">{c.receiptCount}</td>
                    <td className="px-4 py-2 text-right font-mono">{baht(c.byMethod.cash)}</td>
                    <td className="px-4 py-2 text-right font-mono">{baht(c.byMethod.transfer + (c.byMethod.card ?? 0))}</td>
                    <td className="px-4 py-2 text-right font-mono">{baht(c.total)}</td>
                    <td className={cn("px-4 py-2 text-right font-mono", c.diff !== 0 && "text-warning")}>
                      {c.diff > 0 ? "+" : ""}
                      {baht(c.diff)}
                    </td>
                    <td className="max-w-56 truncate px-4 py-2 text-ink-600">{c.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  strong,
  subTone = "warning",
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
  subTone?: "warning" | "muted";
}) {
  return (
    <Card className="grid gap-0.5 px-4 py-3">
      <span className="flex items-center gap-1.5 text-xs text-ink-500 [&_svg]:size-3.5">
        {icon}
        {label}
      </span>
      <span className={cn("font-mono text-xl", strong ? "font-semibold text-navy-900" : "text-ink-900")}>{value}</span>
      {sub && <span className={cn("text-xs", subTone === "warning" ? "text-warning" : "text-ink-500")}>{sub}</span>}
    </Card>
  );
}
