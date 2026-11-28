"use client";

import { ArrowLeft, CalendarCheck, Receipt, ReceiptText, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { baht } from "@/lib/money";
import { useSocketEvent } from "@/lib/realtime";
import { INVOICE_STATUS, PAYMENT_METHOD, type InvoiceSummary } from "@/lib/types";
import { InvoiceEditor } from "./InvoiceEditor";

interface Worklist {
  pending: InvoiceSummary[];
  today: InvoiceSummary[];
}

/** หน้ารับชำระ: ซ้าย = บิลรอชำระ + ใบเสร็จวันนี้ · ขวา = บิลที่เลือก (?id=) */
export function BillingWorkspace() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const [list, setList] = useState<Worklist | null>(null);
  const load = useCallback(() => api<Worklist>("/api/billing/worklist").then(setList), []);
  useEffect(() => {
    load();
  }, [load]);
  const live = useSocketEvent("billing:changed", load, load);
  const select = (x: string | null) => router.replace(x ? `/billing?id=${x}` : "/billing", { scroll: false });

  const todayPaid = list?.today.filter((i) => i.status === "paid") ?? [];
  const todayTotal = todayPaid.reduce((s, i) => s + i.total, 0);

  return (
    <div className="grid content-start gap-4 p-4 sm:p-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
      <aside className={cn("grid content-start gap-4", id && "hidden lg:grid")}>
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", live ? "bg-teal-500" : "bg-ink-300")} title={live ? "เชื่อมต่อ real-time" : "ออฟไลน์"} />
          <span className="text-sm text-ink-500">
            วันนี้รับแล้ว <b className="font-mono text-ink-900">฿{baht(todayTotal)}</b> · <span className="font-mono">{todayPaid.length}</span> ใบ
          </span>
          <Link href="/billing/close" className={buttonClass("secondary", "sm", "ml-auto")}>
            <CalendarCheck />
            ปิดยอด
          </Link>
        </div>

        <section className="grid gap-2">
          <h2 className="flex items-center justify-between text-sm font-semibold text-navy-900">
            รอชำระ
            <span className="font-mono text-ink-500">{list?.pending.length ?? "–"}</span>
          </h2>
          {!list && <Skeleton className="h-20 w-full" />}
          {list?.pending.length === 0 && <p className="rounded-lg border border-dashed border-ink-200 px-3 py-4 text-center text-sm text-ink-400">ไม่มีบิลรอชำระ</p>}
          {list?.pending.map((i) => (
            <button
              key={i.id}
              onClick={() => select(i.id)}
              aria-current={i.id === id || undefined}
              className={cn(
                "grid gap-1 rounded-xl border bg-white p-3 text-left transition-colors hover:border-navy-300",
                i.id === id ? "border-teal-500 ring-2 ring-teal-100" : "border-ink-200",
                (i.patient?.allergies.length ?? 0) > 0 && "border-l-4 border-l-danger",
              )}
            >
              <span className="flex items-center gap-2">
                {i.queueNo && <span className="font-mono text-sm text-navy-800">{i.queueNo}</span>}
                <b className="min-w-0 flex-1 truncate">{i.patient?.fullName}</b>
                <span className="font-mono text-sm">฿{baht(i.total)}</span>
              </span>
              <span className="flex items-center gap-2 text-xs text-ink-500">
                <span className="min-w-0 flex-1 truncate">{i.procedure ?? "—"}</span>
                {(i.patient?.allergies.length ?? 0) > 0 && <TriangleAlert className="size-3.5 text-danger" aria-label="แพ้ยา" />}
              </span>
            </button>
          ))}
        </section>

        <section className="grid gap-2">
          <h2 className="flex items-center justify-between text-sm font-semibold text-navy-900">
            ใบเสร็จวันนี้
            <span className="font-mono text-ink-500">{list?.today.length ?? "–"}</span>
          </h2>
          <div className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200 bg-white">
            {list?.today.length === 0 && <p className="px-3 py-4 text-center text-sm text-ink-400">ยังไม่มีใบเสร็จ</p>}
            {list?.today.map((i) => (
              <button
                key={i.id}
                onClick={() => select(i.id)}
                aria-current={i.id === id || undefined}
                className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-navy-50", i.id === id && "bg-navy-50")}
              >
                <span className={cn("font-mono text-xs", i.status === "void" ? "text-ink-400 line-through" : "text-ink-600")}>{i.receiptNo}</span>
                <span className="min-w-0 flex-1 truncate">{i.patient?.fullName}</span>
                {i.status === "void" ? (
                  <Badge tone={INVOICE_STATUS.void.tone} className="px-1.5 py-0">
                    ยกเลิก
                  </Badge>
                ) : (
                  <span className="text-xs text-ink-400">{i.methods.map((m) => PAYMENT_METHOD[m].split(" ")[0]).join("+")}</span>
                )}
                <span className={cn("font-mono", i.status === "void" && "text-ink-400 line-through")}>{baht(i.total)}</span>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className={cn("min-w-0", !id && "hidden lg:block")}>
        {id ? (
          <div className="grid gap-3">
            <button onClick={() => select(null)} className="flex items-center gap-1 text-sm text-navy-700 lg:hidden">
              <ArrowLeft className="size-4" />
              รายการบิล
            </button>
            <InvoiceEditor
              key={id}
              id={id}
              onPaid={(inv) => {
                load();
                router.push(`/billing/receipt/${inv.id}`);
              }}
              onReplaced={(newId) => {
                load();
                select(newId);
              }}
            />
          </div>
        ) : (
          <EmptyState icon={list?.pending.length ? <Receipt /> : <ReceiptText />} title={list?.pending.length ? "เลือกบิลทางซ้ายเพื่อรับชำระ" : "ไม่มีบิลรอชำระ"}>
            บิลจะขึ้นที่นี่อัตโนมัติเมื่อทันตแพทย์กด “เสร็จการรักษา” ในหน้าคิว รายการดึงจากหัตถการที่ทำเสร็จในผังฟัน
          </EmptyState>
        )}
      </section>
    </div>
  );
}
