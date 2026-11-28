"use client";

import { FileText, Receipt } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MoneyInput } from "@/components/billing/inputs";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { addDays, useClinicRefs } from "@/lib/clinic";
import { cn } from "@/lib/cn";
import { thaiDate, todayTH } from "@/lib/format";
import { baht } from "@/lib/money";
import { PLAN_ROW, type InstallmentPlan, type ProcedureItem } from "@/lib/types";

/** แถบความคืบหน้าการผ่อน */
export function PlanProgress({ plan }: { plan: InstallmentPlan }) {
  const pct = Math.min(100, Math.round((plan.paid / plan.total) * 100));
  return (
    <div className="grid gap-1">
      <div className="h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="ชำระแล้ว">
        <div className={cn("h-full rounded-full", plan.status === "completed" ? "bg-success" : "bg-navy-600")} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-ink-500">
        <span>
          ชำระแล้ว <span className="font-mono text-ink-800">{baht(plan.paid)}</span> / <span className="font-mono">{baht(plan.total)}</span>
        </span>
        <span>
          งวด <span className="font-mono">{plan.paidCount}</span>/<span className="font-mono">{plan.count}</span>
        </span>
      </div>
    </div>
  );
}

/** ตารางงวด + ปุ่มออกบิลงวด */
export function PlanSchedule({ plan, canBill }: { plan: InstallmentPlan; canBill: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  async function bill(no: number) {
    setBusy(no);
    try {
      const r = await api<{ invoiceId: string }>(`/api/plans/${plan.id}/bill`, { method: "POST", body: JSON.stringify({ no }) });
      router.push(`/billing?id=${r.invoiceId}`);
    } catch (e) {
      toast((e as ApiError).message, "error");
      setBusy(null);
    }
  }
  // ซ่อนงวดไกลๆ ที่ยังไม่ถึง (เหลือ 3 งวดถัดไป) ให้ตารางไม่ยาวเกิน
  const firstOpen = plan.rows.findIndex((r) => r.status !== "paid");
  const shown = plan.rows.filter((r, i) => r.status !== "upcoming" || i < firstOpen + 3);
  const hidden = plan.rows.length - shown.length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-500">
          <tr>
            <th className="py-1.5 pr-3 font-medium">งวด</th>
            <th className="py-1.5 pr-3 font-medium">ครบกำหนด</th>
            <th className="py-1.5 pr-3 text-right font-medium">จำนวนเงิน</th>
            <th className="py-1.5 pr-3 font-medium">สถานะ</th>
            <th className="py-1.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {shown.map((r) => (
            <tr key={r.no}>
              <td className="py-1.5 pr-3">{r.no === 0 ? "เงินดาวน์" : <span className="font-mono">{r.no}</span>}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap">{thaiDate(r.due)}</td>
              <td className="py-1.5 pr-3 text-right font-mono">{baht(r.amount)}</td>
              <td className="py-1.5 pr-3">
                <Badge tone={PLAN_ROW[r.status].tone}>{PLAN_ROW[r.status].label}</Badge>
              </td>
              <td className="py-1.5 text-right">
                {r.status === "paid" && r.invoiceId && (
                  <Link href={`/billing/receipt/${r.invoiceId}`} className="font-mono text-xs text-teal-700 hover:underline">
                    {r.receiptNo}
                  </Link>
                )}
                {r.status === "billed" && canBill && (
                  <Link href={`/billing?id=${r.invoiceId}`} className={buttonClass("secondary", "sm")}>
                    <Receipt />
                    รับชำระ
                  </Link>
                )}
                {["overdue", "due", "upcoming"].includes(r.status) && canBill && plan.status === "active" && (
                  <Button size="sm" variant={r.status === "upcoming" ? "ghost" : "primary"} disabled={busy !== null} onClick={() => bill(r.no)}>
                    <FileText />
                    ออกบิลงวดนี้
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 && <p className="pt-2 text-xs text-ink-400">อีก {hidden} งวดถัดไปยังไม่ถึงกำหนด</p>}
    </div>
  );
}

/** สร้างแผนผ่อนชำระ (เงินดาวน์จะถูกออกบิลให้ทันที) */
export function CreatePlanDialog({ patient: preset, onCreated }: { patient?: PickedPatient; onCreated: (invoiceId?: string) => void }) {
  const { dentists } = useClinicRefs();
  const [procedures, setProcedures] = useState<ProcedureItem[]>([]);
  const [patient, setPatient] = useState<PickedPatient | null>(preset ?? null);
  const [dentistId, setDentistId] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState(0);
  const [down, setDown] = useState(0);
  const [count, setCount] = useState(12);
  const [firstDue, setFirstDue] = useState(addDays(todayTH(), 30));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<ProcedureItem[]>("/api/procedures").then(setProcedures);
  }, []);
  const per = count > 0 && total > down ? Math.floor((total - down) / count / 100) * 100 : 0;
  const last = total - down - per * (count - 1);

  return (
    <DialogContent title="สร้างแผนผ่อนชำระ" description="เช่น จัดฟัน หรือรากฟันเทียม · ยอดต่องวดปัดเป็นบาท เศษไปรวมงวดสุดท้าย" className="max-w-xl">
      <form
        className="grid gap-4 overflow-y-auto p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const r = await api<{ invoiceId?: string }>("/api/plans", {
              method: "POST",
              body: JSON.stringify({ patientId: patient?.id, dentistId, procedureId: procedureId || undefined, title, total, downPayment: down, count, firstDue, note }),
            });
            toast(r.invoiceId ? "สร้างแผนแล้ว — ไปรับเงินดาวน์" : "สร้างแผนแล้ว");
            onCreated(r.invoiceId);
          } catch (err) {
            setError((err as ApiError).message);
            setBusy(false);
          }
        }}
      >
        {!preset && (
          <Field label="คนไข้">{(p) => <PatientPicker id={p.id} value={patient} onChange={setPatient} />}</Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อแผน">
            {(p) => <Input {...p} required maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น จัดฟันแบบติดแน่น" />}
          </Field>
          <Field label="หัตถการ (สำหรับคิด DF)">
            {(p) => (
              <Select
                {...p}
                value={procedureId}
                onChange={(e) => {
                  setProcedureId(e.target.value);
                  const x = procedures.find((pr) => pr.id === e.target.value);
                  if (x && !title) setTitle(x.name);
                }}
              >
                <option value="">ไม่ระบุ</option>
                {procedures.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="ทันตแพทย์">
            {(p) => (
              <Select {...p} required value={dentistId} onChange={(e) => setDentistId(e.target.value)}>
                <option value="">เลือกทันตแพทย์</option>
                {dentists.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="ยอดรวม (บาท)">{(p) => <MoneyInput {...p} value={total} blankZero placeholder="0.00" onValue={setTotal} />}</Field>
          <Field label="เงินดาวน์ (บาท)">{(p) => <MoneyInput {...p} value={down} blankZero placeholder="0.00" onValue={setDown} />}</Field>
          <Field label="จำนวนงวด">
            {(p) => <Input {...p} type="number" min={1} max={60} value={count} onChange={(e) => setCount(Math.max(1, Math.min(60, Math.floor(Number(e.target.value) || 1))))} className="font-mono" />}
          </Field>
          <Field label="ครบกำหนดงวดแรก">{(p) => <Input {...p} type="date" required value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />}</Field>
        </div>
        {per > 0 && (
          <Alert tone="info">
            ผ่อน <span className="font-mono">{count}</span> งวด งวดละ <b className="font-mono">{baht(per)}</b>
            {last !== per && (
              <>
                {" "}
                (งวดสุดท้าย <span className="font-mono">{baht(last)}</span>)
              </>
            )}{" "}
            ทุกวันที่ {Number(firstDue.slice(8))} ของเดือน
          </Alert>
        )}
        <Field label="หมายเหตุ">{(p) => <Textarea {...p} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />}</Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || !patient || !dentistId || !title.trim() || total <= 0 || down >= total}>
            สร้างแผน
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

/** รับมัดจำ → เปิดบิลมัดจำแล้วไปรับเงินที่หน้าการเงิน */
export function DepositDialog({ patientId, onCreated }: { patientId: string; onCreated: (invoiceId: string) => void }) {
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <DialogContent title="รับมัดจำ" description="ออกใบเสร็จรับมัดจำ แล้วใช้ตัดชำระบิลครั้งถัดไปได้">
      <form
        className="grid gap-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await api<{ invoiceId: string }>(`/api/patients/${patientId}/deposits`, { method: "POST", body: JSON.stringify({ amount, note }) });
            onCreated(r.invoiceId);
          } catch (err) {
            setError((err as ApiError).message);
            setBusy(false);
          }
        }}
      >
        <Field label="จำนวนเงิน (บาท)">{(p) => <MoneyInput {...p} autoFocus value={amount} blankZero placeholder="0.00" onValue={setAmount} />}</Field>
        <Field label="สำหรับ">{(p) => <Input {...p} value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ผ่าฟันคุด 38" />}</Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || amount <= 0}>
            ไปรับชำระ
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
