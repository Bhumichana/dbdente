"use client";

import { CalendarClock, Plus, ReceiptText, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CreatePlanDialog, DepositDialog, PlanProgress, PlanSchedule } from "@/components/finance/PlanParts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { thaiDate } from "@/lib/format";
import { baht } from "@/lib/money";
import { useSocketEvent } from "@/lib/realtime";
import { INVOICE_STATUS, PAYMENT_METHOD, type InstallmentPlan, type InvoiceSummary, type Patient } from "@/lib/types";

const KIND_LABEL = { deposit: "รับมัดจำ", installment: "ค่างวด", service: "" } as const;

/** แท็บการเงินในแฟ้มคนไข้: ค้างชำระ / มัดจำ / แผนผ่อน / บิลย้อนหลัง */
export function PatientBilling({ patient }: { patient: Patient }) {
  const router = useRouter();
  const [list, setList] = useState<InvoiceSummary[] | null>(null);
  const [finance, setFinance] = useState<{ depositBalance: number; plans: InstallmentPlan[] } | null>(null);
  const [dialog, setDialog] = useState<"deposit" | "plan" | null>(null);
  const load = useCallback(() => {
    api<InvoiceSummary[]>(`/api/invoices?patientId=${patient.id}`).then(setList);
    api<{ depositBalance: number; plans: InstallmentPlan[] }>(`/api/patients/${patient.id}/finance`).then(setFinance);
  }, [patient.id]);
  useEffect(() => {
    load();
  }, [load]);
  useSocketEvent("billing:changed", load, load);

  if (!list || !finance) return <Skeleton className="m-6 h-40" />;
  const due = list.filter((i) => i.status === "draft").reduce((s, i) => s + i.total, 0);
  const paid = list.filter((i) => i.status === "paid" && i.kind !== "deposit").reduce((s, i) => s + i.total, 0);
  const go = (invoiceId?: string) => {
    setDialog(null);
    if (invoiceId) router.push(`/billing?id=${invoiceId}`);
    else load();
  };

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 p-4 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className={cn("grid gap-0.5 px-4 py-3", due > 0 && "border-warning bg-warning-soft/40")}>
          <span className="text-xs text-ink-500">ค้างชำระ</span>
          <span className={cn("font-mono text-xl", due > 0 ? "text-warning" : "text-ink-900")}>฿{baht(due)}</span>
        </Card>
        <Card className="flex items-center gap-3 px-4 py-3">
          <div className="grid flex-1 gap-0.5">
            <span className="text-xs text-ink-500">มัดจำคงเหลือ</span>
            <span className="font-mono text-xl text-ink-900">฿{baht(finance.depositBalance)}</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setDialog("deposit")}>
            <Wallet />
            รับมัดจำ
          </Button>
        </Card>
        <Card className="grid gap-0.5 px-4 py-3">
          <span className="text-xs text-ink-500">ชำระค่ารักษาแล้วทั้งหมด</span>
          <span className="font-mono text-xl text-ink-900">฿{baht(paid)}</span>
        </Card>
      </div>

      <section className="grid gap-2">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 font-semibold text-ink-900">แผนผ่อนชำระ</h2>
          <Button size="sm" variant="secondary" onClick={() => setDialog("plan")}>
            <Plus />
            สร้างแผนผ่อน
          </Button>
        </div>
        {finance.plans.length === 0 && (
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-ink-200 px-4 py-3 text-sm text-ink-500">
            <CalendarClock className="size-4" />
            ยังไม่มีแผนผ่อน (ใช้กับจัดฟัน / รากฟันเทียม)
          </p>
        )}
        {finance.plans.map((p) => (
          <Card key={p.id} className="grid gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-ink-900">{p.title}</b>
              <span className="text-sm text-ink-500">{p.dentistName}</span>
              {p.overdue.length > 0 && <Badge tone="danger">ค้าง {p.overdue.length} งวด</Badge>}
              {p.status !== "active" && <Badge tone={p.status === "completed" ? "success" : "neutral"}>{p.status === "completed" ? "ผ่อนครบแล้ว" : "ยกเลิก"}</Badge>}
            </div>
            <PlanProgress plan={p} />
            <PlanSchedule plan={p} canBill />
          </Card>
        ))}
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold text-ink-900">บิลและใบเสร็จ</h2>
        {list.length === 0 ? (
          <EmptyState icon={<ReceiptText />} title="ยังไม่มีบิล">
            บิลจะถูกสร้างเมื่อจบการรักษาในแต่ละ visit
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>วันที่</TH>
                <TH>รายการ</TH>
                <TH>สถานะ</TH>
                <TH>ใบเสร็จ</TH>
                <TH className="text-right">จำนวนเงิน</TH>
              </tr>
            </THead>
            <TBody>
              {list.map((i) => (
                <tr key={i.id} className={cn(i.status === "void" && "text-ink-400")}>
                  <TD className="whitespace-nowrap">{thaiDate(i.visitDate)}</TD>
                  <TD className="max-w-64 truncate">
                    {KIND_LABEL[i.kind] && (
                      <Badge tone="navy" className="mr-1.5">
                        {KIND_LABEL[i.kind]}
                      </Badge>
                    )}
                    {i.procedure ?? (i.kind === "service" ? "—" : "")}
                  </TD>
                  <TD>
                    <Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge>
                    {i.status === "paid" && <span className="ml-2 text-xs text-ink-500">{i.methods.map((m) => PAYMENT_METHOD[m].split(" ")[0]).join(" + ")}</span>}
                  </TD>
                  <TD>
                    {i.receiptNo ? (
                      <Link href={`/billing/receipt/${i.id}`} className="font-mono text-teal-700 hover:underline">
                        {i.receiptNo}
                      </Link>
                    ) : (
                      <Link href={`/billing?id=${i.id}`} className="text-teal-700 hover:underline">
                        รับชำระ
                      </Link>
                    )}
                  </TD>
                  <TD num className={cn(i.status === "void" && "line-through")}>
                    {baht(i.total)}
                  </TD>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <Dialog open={dialog === "deposit"} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog === "deposit" && <DepositDialog patientId={patient.id} onCreated={go} />}
      </Dialog>
      <Dialog open={dialog === "plan"} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog === "plan" && <CreatePlanDialog patient={patient} onCreated={go} />}
      </Dialog>
    </div>
  );
}
