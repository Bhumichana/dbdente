"use client";

import { AlarmClock, CheckCheck, FlaskConical, PackageCheck, Pencil, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MoneyInput, TeethInput } from "@/components/billing/inputs";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { addDays, useClinicRefs } from "@/lib/clinic";
import { cn } from "@/lib/cn";
import { thaiDate, todayTH } from "@/lib/format";
import { baht } from "@/lib/money";
import { useRole, useSession } from "@/lib/session";
import { LAB_STATUS, type Lab, type LabCase, type LabStatus } from "@/lib/types";

const WORKS = ["ครอบฟันเซรามิก (PFM)", "ครอบฟันเซรามิกล้วน (Emax)", "สะพานฟัน", "ฟันปลอมถอดได้ฐานอะคริลิก", "ฟันปลอมถอดได้โครงโลหะ", "รีเทนเนอร์ใส", "เฝือกสบฟัน (Night guard)", "Inlay / Onlay"];
const open = (c: LabCase) => c.status === "sent" || c.status === "remake";

/** งานแล็บ: ส่งงาน → รับกลับ → ใส่ให้คนไข้ · เรียงงานเลยกำหนดขึ้นก่อน */
export function LabBoard() {
  const role = useRole();
  const [cases, setCases] = useState<LabCase[] | null>(null);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [editing, setEditing] = useState<LabCase | "new" | null>(null);
  const [remake, setRemake] = useState<LabCase | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => api<LabCase[]>("/api/lab-cases").then(setCases), []);
  useEffect(() => {
    load();
    api<Lab[]>("/api/labs").then(setLabs);
  }, [load]);

  async function move(c: LabCase, status: LabStatus, extra: object = {}) {
    setBusy(c.id);
    try {
      await api(`/api/lab-cases/${c.id}/status`, { method: "POST", body: JSON.stringify({ status, ...extra }) });
      toast(`${c.patient?.fullName}: ${LAB_STATUS[status].label}`);
      load();
    } catch (e) {
      toast((e as ApiError).message, "error");
    } finally {
      setBusy(null);
    }
  }

  if (!cases) return <Skeleton className="m-6 h-64" />;
  const overdue = cases.filter((c) => c.overdue).length;
  const soon = cases.filter((c) => c.dueSoon).length;
  const toFit = cases.filter((c) => c.status === "received").length;
  const shown = filter === "open" ? cases.filter((c) => open(c) || c.status === "received") : cases;

  return (
    <div className="mx-auto grid max-w-6xl gap-5 p-4 sm:p-6">
      <div className="grid grid-cols-3 gap-3">
        <Card className={cn("grid gap-0.5 px-4 py-3", overdue > 0 && "border-danger/40 bg-danger-soft/40")}>
          <span className="flex items-center gap-1.5 text-xs text-ink-500">
            <AlarmClock className="size-3.5" />
            เลยกำหนดรับ
          </span>
          <span className={cn("font-mono text-xl", overdue > 0 ? "text-danger" : "text-ink-900")}>{overdue}</span>
        </Card>
        <Card className="grid gap-0.5 px-4 py-3">
          <span className="text-xs text-ink-500">ครบกำหนดใน 2 วัน</span>
          <span className={cn("font-mono text-xl", soon > 0 ? "text-warning" : "text-ink-900")}>{soon}</span>
        </Card>
        <Card className="grid gap-0.5 px-4 py-3">
          <span className="text-xs text-ink-500">รับงานแล้ว รอใส่</span>
          <span className="font-mono text-xl">{toFit}</span>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5">
          {(
            [
              ["open", "งานที่ยังไม่ปิด"],
              ["all", "ทั้งหมด"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              role="tab"
              aria-selected={filter === v}
              onClick={() => setFilter(v)}
              className={cn("rounded-md px-3 py-1.5 text-sm", filter === v ? "bg-navy-700 font-medium text-white" : "text-ink-600 hover:bg-navy-50")}
            >
              {l}
            </button>
          ))}
        </div>
        {role === "dentist" && <span className="text-sm text-ink-500">แสดงเฉพาะงานของคุณ</span>}
        <span className="flex-1" />
        <Button onClick={() => setEditing("new")}>
          <Plus />
          ส่งงานแล็บ
        </Button>
      </div>

      {shown.length === 0 && (
        <EmptyState icon={<FlaskConical />} title="ไม่มีงานแล็บที่ค้างอยู่">
          บันทึกงานที่ส่งแล็บพร้อมวันนัดรับ ระบบจะเตือนเมื่อใกล้หรือเลยกำหนด
        </EmptyState>
      )}

      <div className="grid gap-2">
        {shown.map((c) => (
          <Card
            key={c.id}
            className={cn("grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center", c.overdue && "border-l-4 border-l-danger", c.dueSoon && "border-l-4 border-l-warning")}
          >
            <div className="grid min-w-0 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/patients/${c.patientId}`} className="font-semibold text-ink-900 hover:underline">
                  {c.patient?.fullName}
                </Link>
                <span className="font-mono text-sm text-ink-500">{c.patient?.hn}</span>
                <Badge tone={LAB_STATUS[c.status].tone}>{LAB_STATUS[c.status].label}</Badge>
                {c.overdue && <Badge tone="danger-solid">เลยกำหนด</Badge>}
                {c.dueSoon && <Badge tone="warning">ใกล้ครบกำหนด</Badge>}
              </div>
              <p className="text-sm text-ink-700">
                {c.work}
                {c.teeth.length > 0 && (
                  <>
                    {" "}
                    · ซี่ <span className="font-mono">{c.teeth.join(", ")}</span>
                  </>
                )}
                {c.shade && <> · สี {c.shade}</>}
              </p>
              <p className="text-xs text-ink-500">
                {c.labName} · {c.dentistName} · ส่ง {thaiDate(c.sentAt, { day: "numeric", month: "short" })} · นัดรับ{" "}
                <b className={cn(c.overdue ? "text-danger" : "text-ink-700")}>{thaiDate(c.dueDate, { day: "numeric", month: "short" })}</b>
                {c.cost > 0 && (
                  <>
                    {" "}
                    · ค่าแล็บ <span className="font-mono">{baht(c.cost)}</span>
                  </>
                )}
                {c.linkedItem && (
                  <>
                    {" "}
                    · ผูกกับ {c.linkedItem}
                    {c.linkedReceipt && <span className="font-mono"> ({c.linkedReceipt})</span>}
                  </>
                )}
              </p>
              {c.note && <p className="text-xs text-ink-500">{c.note}</p>}
            </div>
            <div className="flex flex-wrap gap-1.5 sm:justify-end">
              {open(c) && (
                <Button size="sm" disabled={busy === c.id} onClick={() => move(c, "received")}>
                  <PackageCheck />
                  รับงานแล้ว
                </Button>
              )}
              {c.status === "received" && (
                <>
                  <Button size="sm" disabled={busy === c.id} onClick={() => move(c, "fitted")}>
                    <CheckCheck />
                    ใส่ให้คนไข้แล้ว
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setRemake(c)}>
                    <RotateCcw />
                    ส่งแก้
                  </Button>
                </>
              )}
              {(open(c) || c.status === "received") && (
                <Button size="sm" variant="ghost" aria-label="แก้ไข" onClick={() => setEditing(c)}>
                  <Pencil />
                </Button>
              )}
              {open(c) && (
                <Button size="sm" variant="ghost" aria-label="ยกเลิกงาน" disabled={busy === c.id} onClick={() => move(c, "cancelled")}>
                  <X />
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <LabCaseDialog
            initial={editing === "new" ? null : editing}
            labs={labs}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Dialog>
      <Dialog open={!!remake} onOpenChange={(o) => !o && setRemake(null)}>
        {remake && (
          <RemakeDialog
            c={remake}
            onDone={(dueDate, reason) => {
              setRemake(null);
              move(remake, "remake", { dueDate, reason });
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function RemakeDialog({ c, onDone }: { c: LabCase; onDone: (due: string, reason: string) => void }) {
  const [due, setDue] = useState(addDays(todayTH(), 5));
  const [reason, setReason] = useState("");
  return (
    <DialogContent title="ส่งงานกลับไปแก้" description={`${c.work} · ${c.labName}`}>
      <form
        className="grid gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          onDone(due, reason);
        }}
      >
        <Field label="เหตุผล">{(p) => <Input {...p} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น สีไม่ตรง, ขอบไม่แนบ" />}</Field>
        <Field label="นัดรับงานแก้">{(p) => <Input {...p} type="date" min={todayTH()} required value={due} onChange={(e) => setDue(e.target.value)} />}</Field>
        <div className="flex justify-end">
          <Button type="submit" disabled={!reason.trim()}>
            ส่งแก้
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

interface Billable {
  itemId: string;
  name: string;
  teeth: number[];
  receiptNo?: string;
  date: string;
}

function LabCaseDialog({ initial, labs, onSaved }: { initial: LabCase | null; labs: Lab[]; onSaved: () => void }) {
  const me = useSession((s) => s.user);
  const { dentists } = useClinicRefs();
  const [patient, setPatient] = useState<PickedPatient | null>(initial?.patient ? { ...initial.patient, allergies: [] } : null);
  const [f, setF] = useState({
    dentistId: initial?.dentistId ?? (me?.role === "dentist" || me?.role === "owner" ? me.id : ""),
    labId: initial?.labId ?? labs[0]?.id ?? "",
    work: initial?.work ?? "",
    teeth: initial?.teeth ?? [],
    shade: initial?.shade ?? "",
    sentAt: initial?.sentAt ?? todayTH(),
    dueDate: initial?.dueDate ?? addDays(todayTH(), 7),
    cost: initial?.cost ?? 0,
    invoiceItemId: initial?.invoiceItemId ?? "",
    note: initial?.note ?? "",
  });
  const [billable, setBillable] = useState<Billable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canLink = me?.role !== "assistant";
  useEffect(() => {
    if (!patient || !canLink) return;
    api<Billable[]>(`/api/lab-cases/billable?patientId=${patient.id}`).then(setBillable);
  }, [patient, canLink]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <DialogContent title={initial ? "แก้ไขงานแล็บ" : "ส่งงานแล็บ"} className="max-w-xl">
      <form
        className="grid gap-4 overflow-y-auto p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const body = JSON.stringify({ ...f, patientId: patient?.id, invoiceItemId: f.invoiceItemId || "" });
            if (initial) await api(`/api/lab-cases/${initial.id}`, { method: "PUT", body });
            else await api("/api/lab-cases", { method: "POST", body });
            toast(initial ? "บันทึกแล้ว" : "บันทึกงานส่งแล็บแล้ว");
            onSaved();
          } catch (err) {
            setError((err as ApiError).message);
            setBusy(false);
          }
        }}
      >
        <Field label="คนไข้">
          {(p) => (
            <PatientPicker
              id={p.id}
              value={patient}
              onChange={(x) => {
                setPatient(x);
                set("invoiceItemId", "");
              }}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ทันตแพทย์">
            {(p) => (
              <Select {...p} required value={f.dentistId} onChange={(e) => set("dentistId", e.target.value)}>
                <option value="">เลือก</option>
                {dentists.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="แล็บ">
            {(p) => (
              <Select {...p} required value={f.labId} onChange={(e) => set("labId", e.target.value)}>
                {labs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="งาน" className="sm:col-span-2">
            {(p) => (
              <>
                <Input {...p} required list="lab-works" value={f.work} maxLength={120} onChange={(e) => set("work", e.target.value)} placeholder="เช่น ครอบฟันเซรามิก (PFM)" />
                <datalist id="lab-works">
                  {WORKS.map((w) => (
                    <option key={w} value={w} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="ซี่">{(p) => <TeethInput {...p} value={f.teeth} onValue={(t) => set("teeth", t)} />}</Field>
          <Field label="สีฟัน (Shade)">{(p) => <Input {...p} value={f.shade} maxLength={20} onChange={(e) => set("shade", e.target.value)} placeholder="เช่น A2" />}</Field>
          <Field label="วันที่ส่ง">{(p) => <Input {...p} type="date" required value={f.sentAt} onChange={(e) => set("sentAt", e.target.value)} />}</Field>
          <Field label="นัดรับงาน">{(p) => <Input {...p} type="date" required min={f.sentAt} value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} />}</Field>
          <Field label="ค่าแล็บ (บาท)" hint="หักก่อนคิด DF ถ้าผูกกับรายการในบิล">
            {(p) => <MoneyInput {...p} value={f.cost} blankZero placeholder="0.00" onValue={(v) => set("cost", v)} />}
          </Field>
          {canLink && (
            <Field label="ผูกกับรายการในบิล">
              {(p) => (
                <Select {...p} value={f.invoiceItemId} disabled={!patient} onChange={(e) => set("invoiceItemId", e.target.value)}>
                  <option value="">ไม่ผูก</option>
                  {billable.map((b) => (
                    <option key={b.itemId} value={b.itemId}>
                      {b.name}
                      {b.teeth.length ? ` · ${b.teeth.join(",")}` : ""} · {b.receiptNo ?? "ยังไม่ชำระ"}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>
        <Field label="หมายเหตุ">{(p) => <Textarea {...p} value={f.note} maxLength={500} onChange={(e) => set("note", e.target.value)} />}</Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || !patient}>
            {initial ? "บันทึก" : "บันทึกงานส่งแล็บ"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
