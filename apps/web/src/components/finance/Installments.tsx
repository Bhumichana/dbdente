"use client";

import { Ban, CalendarClock, ChevronDown, Phone, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { thaiDate } from "@/lib/format";
import { baht } from "@/lib/money";
import { useSocketEvent } from "@/lib/realtime";
import { useRole } from "@/lib/session";
import { PLAN_ROW, type InstallmentPlan } from "@/lib/types";
import { CreatePlanDialog, PlanProgress, PlanSchedule } from "./PlanParts";

type Filter = "attention" | "active" | "closed";
const FILTERS: { v: Filter; label: string }[] = [
  { v: "attention", label: "ต้องติดตาม" },
  { v: "active", label: "กำลังผ่อน" },
  { v: "closed", label: "ปิดแล้ว" },
];

/** หน้าผ่อนชำระ: แผนทั้งหมดของคลินิก เรียงงวดค้างขึ้นก่อน */
export function Installments() {
  const router = useRouter();
  const role = useRole();
  const [plans, setPlans] = useState<InstallmentPlan[] | null>(null);
  const [filter, setFilter] = useState<Filter>("attention");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<InstallmentPlan | null>(null);
  const load = useCallback(() => api<InstallmentPlan[]>("/api/plans").then(setPlans), []);
  useEffect(() => {
    load();
  }, [load]);
  useSocketEvent("billing:changed", load, load);

  if (!plans) return <Skeleton className="m-6 h-64" />;
  const needs = (p: InstallmentPlan) => p.status === "active" && (p.overdue.length > 0 || p.next?.status === "due" || p.next?.status === "billed");
  const shown = plans.filter((p) => (filter === "attention" ? needs(p) : filter === "active" ? p.status === "active" : p.status !== "active"));
  const overdueTotal = plans.reduce((s, p) => s + p.overdue.reduce((a, r) => a + r.amount, 0), 0);
  const outstanding = plans.filter((p) => p.status === "active").reduce((s, p) => s + p.total - p.paid, 0);

  return (
    <div className="mx-auto grid max-w-5xl gap-5 p-4 sm:p-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card className="grid gap-0.5 px-4 py-3">
          <span className="text-xs text-ink-500">แผนที่กำลังผ่อน</span>
          <span className="font-mono text-xl">{plans.filter((p) => p.status === "active").length}</span>
        </Card>
        <Card className={cn("grid gap-0.5 px-4 py-3", overdueTotal > 0 && "border-danger/40 bg-danger-soft/40")}>
          <span className="text-xs text-ink-500">งวดค้างชำระ</span>
          <span className={cn("font-mono text-xl", overdueTotal > 0 ? "text-danger" : "text-ink-900")}>฿{baht(overdueTotal)}</span>
        </Card>
        <Card className="col-span-2 grid gap-0.5 px-4 py-3 lg:col-span-1">
          <span className="text-xs text-ink-500">ยอดคงเหลือที่จะได้รับ</span>
          <span className="font-mono text-xl">฿{baht(outstanding)}</span>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              role="tab"
              aria-selected={filter === f.v}
              onClick={() => setFilter(f.v)}
              className={cn("rounded-md px-3 py-1.5 text-sm", filter === f.v ? "bg-navy-700 font-medium text-white" : "text-ink-600 hover:bg-navy-50")}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <Button onClick={() => setCreating(true)}>
          <Plus />
          สร้างแผนผ่อน
        </Button>
      </div>

      {shown.length === 0 && (
        <EmptyState icon={<CalendarClock />} title={filter === "attention" ? "ไม่มีงวดที่ต้องติดตาม" : "ไม่มีแผน"}>
          {filter === "attention" ? "งวดที่ค้างหรือครบกำหนดวันนี้จะขึ้นที่นี่" : "สร้างแผนผ่อนจากปุ่มด้านบน หรือจากแท็บการเงินในแฟ้มคนไข้"}
        </EmptyState>
      )}

      {shown.map((p) => {
        const isOpen = open === p.id;
        const overdue = p.overdue.reduce((s, r) => s + r.amount, 0);
        return (
          <Card key={p.id} className={cn("grid gap-3 p-4", p.overdue.length > 0 && "border-l-4 border-l-danger")}>
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/patients/${p.patientId}?tab=billing`} className="font-semibold text-ink-900 hover:underline">
                    {p.patient?.fullName}
                  </Link>
                  <span className="font-mono text-sm text-ink-500">{p.patient?.hn}</span>
                  {p.status !== "active" && <Badge tone={p.status === "completed" ? "success" : "neutral"}>{p.status === "completed" ? "ผ่อนครบแล้ว" : "ยกเลิก"}</Badge>}
                </div>
                <p className="text-sm text-ink-600">
                  {p.title} · {p.dentistName}
                </p>
                {p.patient?.phone && p.overdue.length > 0 && (
                  <p className="flex items-center gap-1 text-xs text-ink-500">
                    <Phone className="size-3" />
                    <span className="font-mono">{p.patient.phone}</span>
                  </p>
                )}
              </div>
              <div className="text-right text-sm">
                {p.overdue.length > 0 ? (
                  <Badge tone="danger">
                    ค้าง {p.overdue.length} งวด · <span className="font-mono">฿{baht(overdue)}</span>
                  </Badge>
                ) : p.next ? (
                  <Badge tone={PLAN_ROW[p.next.status].tone}>
                    {p.next.no === 0 ? "เงินดาวน์" : `งวด ${p.next.no}`} · {p.next.status === "due" ? "วันนี้" : thaiDate(p.next.due)}
                  </Badge>
                ) : null}
              </div>
            </div>
            <PlanProgress plan={p} />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.id)}>
                <ChevronDown className={cn("transition-transform", isOpen && "rotate-180")} />
                ตารางงวด
              </Button>
              <span className="flex-1" />
              {role === "owner" && p.status === "active" && (
                <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" onClick={() => setCancelling(p)}>
                  <Ban />
                  ยกเลิกแผน
                </Button>
              )}
            </div>
            {isOpen && <PlanSchedule plan={p} canBill />}
          </Card>
        );
      })}

      <Dialog open={creating} onOpenChange={setCreating}>
        {creating && (
          <CreatePlanDialog
            onCreated={(invoiceId) => {
              setCreating(false);
              if (invoiceId) router.push(`/billing?id=${invoiceId}`);
              else load();
            }}
          />
        )}
      </Dialog>
      <Dialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        {cancelling && (
          <CancelPlan
            plan={cancelling}
            onDone={() => {
              setCancelling(null);
              load();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function CancelPlan({ plan, onDone }: { plan: InstallmentPlan; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <DialogContent title={`ยกเลิกแผน “${plan.title}”`} description="งวดที่ชำระแล้วยังอยู่ตามเดิม บิลงวดที่ยังไม่ชำระจะถูกลบ">
      <form
        className="grid gap-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api(`/api/plans/${plan.id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
            toast("ยกเลิกแผนแล้ว");
            onDone();
          } catch (err) {
            setError((err as ApiError).message);
          }
        }}
      >
        <Field label="เหตุผล" error={error}>
          {(p) => <Textarea {...p} required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" variant="danger" disabled={reason.trim().length < 3}>
            ยืนยันยกเลิกแผน
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
