"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { api, ApiError } from "@/lib/api";
import { thaiDate } from "@/lib/format";
import { baht, bahtText } from "@/lib/money";
import { PAYMENT_METHOD, type Invoice } from "@/lib/types";

/** ใบเสร็จรับเงิน — พิมพ์จากเบราว์เซอร์ (เลือก "บันทึกเป็น PDF" ได้) */
export function Receipt() {
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Invoice>(`/api/invoices/${id}?print=1`).then(setInv, (e: ApiError) => setError(e.message));
  }, [id]);

  if (error) return <Alert className="m-6">{error}</Alert>;
  if (!inv) return <Skeleton className="m-6 h-[600px] max-w-2xl" />;
  if (!inv.receiptNo) return <Alert className="m-6">บิลนี้ยังไม่ได้รับชำระ</Alert>;

  const change = inv.payments.reduce((s, p) => s + Math.max(0, (p.received ?? p.amount) - p.amount), 0);
  const discount = inv.items.reduce((s, i) => s + i.discount, 0);

  return (
    <div className="mx-auto grid max-w-2xl gap-4 p-4 sm:p-6 print:max-w-none print:p-0">
      <div className="flex items-center gap-2 print:hidden">
        <Link href={`/billing?id=${inv.id}`} className={buttonClass("ghost", "sm")}>
          <ArrowLeft />
          กลับหน้ารับชำระ
        </Link>
        <span className="flex-1" />
        <Button onClick={() => window.print()}>
          <Printer />
          พิมพ์ / บันทึก PDF
        </Button>
      </div>

      <article className="relative overflow-hidden rounded-xl border border-ink-200 bg-white p-6 text-sm text-ink-900 sm:p-8 print:rounded-none print:border-0">
        {inv.status === "void" && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="-rotate-[20deg] rounded-xl border-8 border-danger/30 px-8 text-7xl font-bold text-danger/30">ยกเลิก</span>
          </div>
        )}

        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-200 pb-4">
          <div>
            <h1 className="text-base font-semibold">{inv.clinic?.name}</h1>
            {inv.clinic?.address && <p className="max-w-sm text-ink-600">{inv.clinic.address}</p>}
            <p className="text-ink-600">
              {inv.clinic?.phone && <>โทร {inv.clinic.phone}</>}
              {inv.clinic?.taxId && <> · เลขประจำตัวผู้เสียภาษี <span className="font-mono">{inv.clinic.taxId}</span></>}
            </p>
          </div>
          <div className="ml-auto text-right">
            <h2 className="text-xl font-semibold text-navy-900">ใบเสร็จรับเงิน</h2>
            <p>
              เลขที่ <span className="font-mono">{inv.receiptNo}</span>
            </p>
            <p className="text-ink-600">{inv.paidAt && thaiDate(inv.paidAt, { dateStyle: "long", timeStyle: "short" })}</p>
          </div>
        </header>

        <section className="grid gap-0.5 border-b border-ink-200 py-3">
          <p>
            ได้รับเงินจาก <b>{inv.patient?.fullName}</b> <span className="font-mono text-ink-600">({inv.patient?.hn})</span>
          </p>
          <p className="text-ink-600">
            วันที่รับการรักษา {thaiDate(inv.visitDate, { dateStyle: "long" })}
            {inv.dentistName && <> · {inv.dentistName}</>}
          </p>
        </section>

        <table className="my-3 w-full">
          <thead className="border-b border-ink-200 text-left text-xs text-ink-500">
            <tr>
              <th className="py-2 font-medium">รายการ</th>
              <th className="py-2 text-right font-medium">จำนวน</th>
              <th className="py-2 text-right font-medium">ราคา/หน่วย</th>
              <th className="py-2 text-right font-medium">ส่วนลด</th>
              <th className="py-2 text-right font-medium">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {inv.items.map((i) => (
              <tr key={i.id}>
                <td className="py-2 pr-2">
                  {i.name}
                  {i.teeth.length > 0 && <span className="text-ink-500"> · ซี่ <span className="font-mono">{i.teeth.join(", ")}</span></span>}
                </td>
                <td className="py-2 text-right font-mono">{i.qty}</td>
                <td className="py-2 text-right font-mono">{baht(i.unitPrice)}</td>
                <td className="py-2 text-right font-mono">{i.discount ? baht(i.discount) : "—"}</td>
                <td className="py-2 text-right font-mono">{baht(i.qty * i.unitPrice - i.discount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid gap-1 border-t border-ink-200 pt-3">
          {discount > 0 && (
            <p className="flex justify-between text-ink-600">
              ส่วนลดรวม <span className="font-mono">{baht(discount)}</span>
            </p>
          )}
          <p className="flex items-baseline justify-between text-base font-semibold">
            รวมทั้งสิ้น <span className="font-mono text-lg">{baht(inv.total)}</span>
          </p>
          <p className="text-right text-ink-600">({bahtText(inv.total)})</p>
        </div>

        <div className="mt-3 grid gap-1 rounded-lg bg-navy-50 px-4 py-3 print:bg-transparent print:px-0">
          {inv.payments.map((p, i) => (
            <p key={i} className="flex justify-between">
              <span>
                ชำระด้วย{PAYMENT_METHOD[p.method]}
                {p.method === "cash" && p.received && p.received !== p.amount && <span className="text-ink-600"> (รับมา {baht(p.received)})</span>}
                {p.ref && <span className="text-ink-600"> · อ้างอิง {p.ref}</span>}
              </span>
              <span className="font-mono">{baht(p.amount)}</span>
            </p>
          ))}
          {change > 0 && (
            <p className="flex justify-between text-ink-600">
              เงินทอน <span className="font-mono">{baht(change)}</span>
            </p>
          )}
        </div>

        {inv.status === "void" && (
          <p className="mt-3 text-danger">
            ยกเลิกเมื่อ {thaiDate(inv.voidedAt!, { dateStyle: "medium", timeStyle: "short" })} โดย {inv.voidedByName} · {inv.voidReason}
          </p>
        )}

        <footer className="mt-10 flex justify-end">
          <div className="w-56 text-center">
            <div className="border-b border-dotted border-ink-400 pb-1">&nbsp;</div>
            <p className="mt-1">ผู้รับเงิน · {inv.paidByName}</p>
          </div>
        </footer>
      </article>
      <p className="text-center text-xs text-ink-400 print:hidden">เดโม: ใบเสร็จนี้ยังไม่ใช่ใบกำกับภาษี</p>
    </div>
  );
}
