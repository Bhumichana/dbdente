"use client";

import { BellRing, CheckCheck, DoorOpen, ExternalLink, LogIn, Megaphone, Monitor, Plus, Receipt, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { minutesSince, nowLocal, useClinicRefs } from "@/lib/clinic";
import { cn } from "@/lib/cn";
import { thaiDate } from "@/lib/format";
import { baht } from "@/lib/money";
import { useRealtime } from "@/lib/realtime";
import { useRole, useSession } from "@/lib/session";
import { CHAIR_STATUS, type Appointment, type AppointmentStatus, type Chair, type ChairStatus } from "@/lib/types";

const COLUMNS: { status: AppointmentStatus; title: string; empty: string }[] = [
  { status: "arrived", title: "รอตรวจ", empty: "ไม่มีคนไข้รอ" },
  { status: "in_room", title: "ในห้องตรวจ", empty: "ยังไม่มีคนไข้ในห้อง" },
  { status: "awaiting_payment", title: "รอชำระเงิน", empty: "ไม่มีรายการรอชำระ" },
  { status: "done", title: "เสร็จแล้ว", empty: "—" },
];
const WAIT_WARN = 20; // นาที

export function QueueBoard() {
  const role = useRole();
  const me = useSession((s) => s.user?.id);
  const front = role === "owner" || role === "receptionist";
  const canChair = front || role === "assistant";
  const { dentists, chairs, setChairs } = useClinicRefs();

  const [appts, setAppts] = useState<Appointment[]>([]);
  const [mine, setMine] = useState(role === "dentist");
  const [now, setNow] = useState(() => Date.now());
  const [calling, setCalling] = useState<Appointment | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const today = nowLocal().slice(0, 10);
  const load = useCallback(() => {
    api<Appointment[]>(`/api/appointments?date=${today}`).then(setAppts);
    api<Chair[]>("/api/chairs").then(setChairs);
  }, [today, setChairs]);
  useEffect(() => {
    load();
  }, [load]);
  const live = useRealtime(load);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const shown = appts.filter((a) => !mine || a.dentistId === me);
  const notArrived = shown.filter((a) => a.status === "booked");

  async function move(a: Appointment, status: AppointmentStatus, extra: object = {}, msg?: string) {
    setBusy(a.id);
    try {
      const r = await api<Appointment>(`/api/appointments/${a.id}/status`, { method: "POST", body: JSON.stringify({ status, ...extra }) });
      toast(msg ?? (status === "arrived" ? `เช็กอินแล้ว · คิว ${r.queueNo}` : "อัปเดตคิวแล้ว"));
      load();
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function recall(a: Appointment) {
    try {
      await api(`/api/appointments/${a.id}/recall`, { method: "POST" });
      toast(`เรียกคิว ${a.queueNo} ซ้ำแล้ว`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function setChairStatus(c: Chair, status: ChairStatus) {
    try {
      await api(`/api/chairs/${c.id}`, { method: "PUT", body: JSON.stringify({ status }) });
      load();
    } catch (e) {
      toast((e as Error).message, "error");
      load();
    }
  }

  return (
    <div className="grid gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">คิววันนี้</h1>
        <span className="text-sm text-ink-500">{thaiDate(today, { weekday: "long", day: "numeric", month: "long" })}</span>
        <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs", live ? "bg-success-soft text-success" : "bg-ink-100 text-ink-500")}>
          <span className={cn("size-2 rounded-full", live ? "animate-pulse bg-success" : "bg-ink-400")} />
          {live ? "อัปเดตอัตโนมัติ" : "กำลังเชื่อมต่อ…"}
        </span>
        <span className="flex-1" />
        {role === "dentist" && (
          <label className="flex items-center gap-2 text-sm text-ink-600">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="size-4 accent-navy-700" />
            เฉพาะคนไข้ของฉัน
          </label>
        )}
        <a href="/display" target="_blank" rel="noopener" className={buttonClass("secondary")}>
          <Monitor />
          จอเรียกคิว
        </a>
        {front && (
          <Button onClick={() => setWalkIn(true)}>
            <Plus />
            Walk-in
          </Button>
        )}
      </div>

      {/* สถานะเก้าอี้ */}
      <section aria-label="สถานะเก้าอี้" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {chairs.map((c) => {
          const cur = appts.find((a) => a.chairId === c.id && a.status === "in_room");
          return (
            <Card key={c.id} className={cn("grid gap-1 p-3", c.status === "maintenance" && "opacity-60")}>
              <div className="flex items-center gap-2">
                <b className="text-sm">{c.name}</b>
                <span className="flex-1" />
                <span className={cn("size-2.5 rounded-full", CHAIR_STATUS[c.status].dot)} />
              </div>
              {canChair && !cur ? (
                <Select
                  aria-label={`สถานะ ${c.name}`}
                  value={c.status}
                  onChange={(e) => setChairStatus(c, e.target.value as ChairStatus)}
                  className="h-8 px-2 text-xs"
                >
                  {(["available", "preparing", "maintenance"] as const).map((s) => (
                    <option key={s} value={s}>
                      {CHAIR_STATUS[s].label}
                    </option>
                  ))}
                  {c.status === "in_use" && <option value="in_use">{CHAIR_STATUS.in_use.label}</option>}
                </Select>
              ) : (
                <span className="text-xs text-ink-600">{CHAIR_STATUS[c.status].label}</span>
              )}
              <span className="truncate text-xs text-ink-500">
                {cur ? (
                  <>
                    <span className="font-mono">{cur.queueNo}</span> · {cur.dentistName?.replace(/\s*\(.*\)$/, "")} ·{" "}
                    <span className="font-mono">{minutesSince(cur.calledAt, now)}</span> นาที
                  </>
                ) : (
                  " "
                )}
              </span>
            </Card>
          );
        })}
      </section>

      {/* นัดวันนี้ที่ยังไม่มา */}
      {notArrived.length > 0 && (
        <section aria-label="นัดที่ยังไม่มา">
          <h2 className="mb-2 text-sm font-medium text-ink-500">
            นัดวันนี้ที่ยังไม่มา <span className="font-mono">{notArrived.length}</span>
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {notArrived.map((a) => (
              <Card key={a.id} className="flex shrink-0 items-center gap-3 px-3 py-2">
                <span className="font-mono text-sm text-navy-700">{a.start.slice(11)}</span>
                <span className="grid text-sm leading-tight">
                  <span className="font-medium">{a.patient?.fullName}</span>
                  <span className="text-xs text-ink-500">
                    {a.procedure} · {a.dentistName?.replace(/\s*\(.*\)$/, "")}
                  </span>
                </span>
                {(front || role === "assistant") && (
                  <Button size="sm" variant="secondary" disabled={busy === a.id} onClick={() => move(a, "arrived")}>
                    <LogIn />
                    เช็กอิน
                  </Button>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* บอร์ดคิว */}
      <section aria-label="บอร์ดคิว" className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = shown
            .filter((a) => a.status === col.status)
            .sort((x, y) => (x.arrivedAt ?? x.start).localeCompare(y.arrivedAt ?? y.start));
          return (
            <div key={col.status} className="grid gap-2 rounded-xl border border-ink-200 bg-navy-50/60 p-2">
              <h2 className="flex items-center justify-between px-1.5 pt-1 text-sm font-semibold text-navy-900">
                {col.title}
                <span className="font-mono text-ink-500">{items.length}</span>
              </h2>
              {items.length === 0 && <p className="px-1.5 pb-2 text-xs text-ink-400">{col.empty}</p>}
              {items.map((a) => {
                const wait = minutesSince(a.arrivedAt, now);
                const inRoom = minutesSince(a.calledAt, now);
                const allergy = (a.patient?.allergies.length ?? 0) > 0;
                return (
                  <Card key={a.id} className={cn("grid gap-1.5 p-3", allergy && "border-l-4 border-l-danger", col.status === "done" && "opacity-75")}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-medium text-navy-800">{a.queueNo}</span>
                      <b className="min-w-0 flex-1 truncate">{a.patient?.fullName}</b>
                      {a.walkIn && <Badge>Walk-in</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                      <span className="font-mono">{a.patient?.hn}</span>
                      {!a.walkIn && <span>นัด {a.start.slice(11)}</span>}
                      {col.status === "arrived" && (
                        <Badge tone={wait >= WAIT_WARN ? "warning" : "neutral"} className="px-1.5 py-0">
                          รอ <span className="font-mono">{wait}</span> นาที
                        </Badge>
                      )}
                      {col.status === "in_room" && (
                        <Badge tone="navy" className="px-1.5 py-0">
                          {a.chairName} · <span className="font-mono">{inRoom}</span> นาที
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-ink-700">{a.procedure}</div>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-ink-500">
                      {a.dentistName}
                      {allergy && (
                        <Badge tone="danger" className="ml-auto px-1.5 py-0">
                          <TriangleAlert className="size-3" />
                          แพ้ยา
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1 empty:hidden">
                      {col.status === "arrived" && (
                        <Button size="sm" disabled={busy === a.id} onClick={() => setCalling(a)}>
                          <DoorOpen />
                          เรียกเข้าห้อง
                        </Button>
                      )}
                      {col.status === "in_room" && (
                        <>
                          <Button size="sm" disabled={busy === a.id} onClick={() => move(a, "awaiting_payment", {}, `${a.queueNo} เสร็จการรักษา → รอชำระเงิน`)}>
                            <CheckCheck />
                            เสร็จการรักษา
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => recall(a)} title="เรียกซ้ำบนจอ">
                            <Megaphone />
                          </Button>
                        </>
                      )}
                      {col.status === "awaiting_payment" && front && a.invoice && (
                        <Link href={`/billing?id=${a.invoice.id}`} className={buttonClass("primary", "sm")}>
                          <Receipt />
                          รับชำระ <span className="font-mono">฿{baht(a.invoice.total)}</span>
                        </Link>
                      )}
                      {col.status === "done" && front && a.invoice?.receiptNo && (
                        <Link href={`/billing/receipt/${a.invoice.id}`} className={buttonClass("ghost", "sm")}>
                          <Receipt />
                          <span className="font-mono">{a.invoice.receiptNo}</span>
                        </Link>
                      )}
                      {role !== "receptionist" && col.status !== "done" && (
                        <Link href={`/patients/${a.patientId}`} className={buttonClass("ghost", "sm")}>
                          <ExternalLink />
                          แฟ้ม
                        </Link>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          );
        })}
      </section>

      {shown.length === 0 && <EmptyState icon={<BellRing />} title="ยังไม่มีคิววันนี้">{front ? "เช็กอินคนไข้ที่มีนัด หรือรับ Walk-in" : "คิวจะขึ้นที่นี่เมื่อเคาน์เตอร์เช็กอินคนไข้"}</EmptyState>}

      <Dialog open={!!calling} onOpenChange={(o) => !o && setCalling(null)}>
        {calling && (
          <CallDialog
            key={calling.id}
            appt={calling}
            chairs={chairs}
            busyChairIds={appts.filter((a) => a.status === "in_room").map((a) => a.chairId!)}
            onCall={async (chairId) => {
              const ok = await move(calling, "in_room", { chairId }, `เรียก ${calling.queueNo} เข้า ${chairs.find((c) => c.id === chairId)?.name}`);
              if (ok) setCalling(null);
            }}
          />
        )}
      </Dialog>

      <Dialog open={walkIn} onOpenChange={setWalkIn}>
        {walkIn && (
          <WalkInDialog
            dentists={dentists}
            onDone={() => {
              setWalkIn(false);
              load();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function CallDialog({ appt, chairs, busyChairIds, onCall }: { appt: Appointment; chairs: Chair[]; busyChairIds: string[]; onCall: (chairId: string) => void }) {
  const usable = (c: Chair) => c.status !== "maintenance" && !busyChairIds.includes(c.id);
  const [chairId, setChairId] = useState(() => (chairs.find((c) => c.id === appt.chairId && usable(c)) ?? chairs.find((c) => usable(c) && c.status === "available"))?.id ?? "");
  return (
    <DialogContent title={`เรียกคิว ${appt.queueNo ?? ""}`} description={`${appt.patient?.fullName} · ${appt.procedure}`}>
      <div className="grid gap-4 px-5 pt-3 pb-5">
        <div role="radiogroup" aria-label="เลือกเก้าอี้" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {chairs.map((c) => (
            <button
              key={c.id}
              role="radio"
              aria-checked={chairId === c.id}
              disabled={!usable(c)}
              onClick={() => setChairId(c.id)}
              className={cn(
                "grid gap-0.5 rounded-lg border p-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40",
                chairId === c.id ? "border-navy-700 bg-navy-700 text-white" : "border-ink-200 hover:bg-navy-50",
              )}
            >
              <b>{c.name}</b>
              <span className={cn("text-xs", chairId === c.id ? "text-navy-100" : "text-ink-500")}>
                {busyChairIds.includes(c.id) ? "มีคนไข้อยู่" : CHAIR_STATUS[c.status].label}
                {c.id === appt.chairId && " · ตามนัด"}
              </span>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button size="lg" disabled={!chairId} onClick={() => onCall(chairId)}>
            <DoorOpen />
            เรียกเข้าห้อง
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

function WalkInDialog({ dentists, onDone }: { dentists: { id: string; name: string }[]; onDone: () => void }) {
  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [dentistId, setDentistId] = useState("");
  const [procedure, setProcedure] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!patient) return setError("เลือกคนไข้");
    if (!dentistId) return setError("เลือกทันตแพทย์");
    setBusy(true);
    try {
      const a = await api<Appointment>("/api/queue/walk-in", {
        method: "POST",
        body: JSON.stringify({ patientId: patient.id, dentistId, procedure: procedure || "ตรวจ / ปรึกษา" }),
      });
      toast(`รับ Walk-in · คิว ${a.queueNo}`);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent title="รับคนไข้ Walk-in" description="คนไข้จะเข้าคิว “รอตรวจ” ทันที">
      <form onSubmit={submit} className="grid gap-4 px-5 pt-3 pb-5">
        <div className="grid gap-1.5">
          <label htmlFor="walkin-patient" className="text-sm font-medium text-ink-700">
            คนไข้
          </label>
          <PatientPicker id="walkin-patient" value={patient} onChange={setPatient} />
          <Link href="/patients/new" className="text-xs text-navy-700 underline">
            คนไข้ใหม่? ลงทะเบียนก่อน
          </Link>
        </div>
        <Field label="ทันตแพทย์">
          {(p) => (
            <Select {...p} value={dentistId} onChange={(e) => setDentistId(e.target.value)}>
              <option value="">เลือกทันตแพทย์…</option>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="อาการ / หัตถการ">
          {(p) => <Input {...p} value={procedure} onChange={(e) => setProcedure(e.target.value)} placeholder="เช่น ปวดฟัน, ฟันบิ่น" />}
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            <Plus />
            เข้าคิว
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
