"use client";

import { Ban, ExternalLink, LogIn, UserX } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { hhmm, nowLocal } from "@/lib/clinic";
import { thaiDate } from "@/lib/format";
import { APPT_STATUS, type Appointment, type AppointmentStatus, type Chair, type Dentist } from "@/lib/types";

export const DAY_START = 8 * 60;
export const DAY_END = 20 * 60;
const TIMES = Array.from({ length: (DAY_END - DAY_START) / 15 }, (_, i) => hhmm(DAY_START + i * 15));
const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const PROCEDURES = ["ตรวจสุขภาพช่องปาก", "ขูดหินปูน", "อุดฟัน", "ถอนฟัน", "รักษารากฟัน (RCT)", "ครอบฟัน", "ปรับลวดจัดฟัน", "ผ่าฟันคุด", "ฟอกสีฟัน"];

export interface AppointmentDraft {
  date: string;
  time: string;
  dentistId?: string;
  chairId?: string;
}

/**
 * สร้าง / แก้ไข / เปลี่ยนสถานะนัด (เปิดในกล่อง Dialog)
 * ผู้ที่แก้ไม่ได้ (ทันตแพทย์ ผู้ช่วย) เห็นแบบอ่านอย่างเดียว
 */
export function AppointmentDialog({
  appointment,
  draft,
  dentists,
  chairs,
  canEdit,
  onDone,
}: {
  appointment?: Appointment;
  draft?: AppointmentDraft;
  dentists: Dentist[];
  chairs: Chair[];
  canEdit: boolean;
  onDone: () => void;
}) {
  const a = appointment;
  const [patient, setPatient] = useState<PickedPatient | null>(
    a?.patient ? { id: a.patient.id, hn: a.patient.hn, fullName: a.patient.fullName, allergies: a.patient.allergies } : null,
  );
  const [f, setF] = useState({
    date: a?.start.slice(0, 10) ?? draft?.date ?? nowLocal().slice(0, 10),
    time: a?.start.slice(11) ?? draft?.time ?? "09:00",
    durationMin: a?.durationMin ?? 30,
    dentistId: a?.dentistId ?? draft?.dentistId ?? "",
    chairId: a?.chairId ?? draft?.chairId ?? "",
    procedure: a?.procedure ?? "",
    note: a?.note ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const editable = canEdit && (!a || a.status === "booked" || a.status === "arrived");
  const timeLocked = a?.status === "arrived";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!patient) return setError("เลือกคนไข้");
    if (!f.dentistId) return setError("เลือกทันตแพทย์");
    if (!f.procedure.trim()) return setError("ระบุหัตถการ");
    setBusy(true);
    setError(null);
    try {
      await api(a ? `/api/appointments/${a.id}` : "/api/appointments", {
        method: a ? "PUT" : "POST",
        body: JSON.stringify({
          patientId: patient.id,
          dentistId: f.dentistId,
          chairId: f.chairId || "",
          start: `${f.date}T${f.time}`,
          durationMin: f.durationMin,
          procedure: f.procedure,
          note: f.note,
        }),
      });
      toast(a ? "บันทึกการแก้ไขนัดแล้ว" : `นัด ${patient.fullName} ${thaiDate(f.date)} ${f.time} น.`);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: AppointmentStatus, msg: string) {
    if (!a) return;
    setBusy(true);
    try {
      const r = await api<Appointment>(`/api/appointments/${a.id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      toast(status === "arrived" ? `เช็กอินแล้ว · คิว ${r.queueNo}` : msg);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const isToday = f.date === nowLocal().slice(0, 10);
  const title = a ? (editable ? "แก้ไขนัดหมาย" : "รายละเอียดนัดหมาย") : "นัดหมายใหม่";

  return (
    <DialogContent title={title} description={a && `${thaiDate(a.start.slice(0, 10))} ${a.start.slice(11)}–${a.end.slice(11)} น.`} className="max-w-xl">
      <form onSubmit={submit} className="grid gap-4 overflow-y-auto px-5 pt-3 pb-5">
        {a && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={APPT_STATUS[a.status].tone}>{APPT_STATUS[a.status].label}</Badge>
            {a.queueNo && <span className="font-mono text-sm text-ink-600">คิว {a.queueNo}</span>}
            {a.walkIn && <Badge>Walk-in</Badge>}
            <span className="flex-1" />
            <Link href={`/patients/${a.patientId}`} className={buttonClass("ghost", "sm")}>
              <ExternalLink />
              แฟ้มคนไข้
            </Link>
          </div>
        )}

        <div className="grid gap-1.5">
          <label htmlFor="appt-patient" className="text-sm font-medium text-ink-700">
            คนไข้
          </label>
          <PatientPicker id="appt-patient" value={patient} onChange={setPatient} disabled={!!a || !editable} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="วันที่">
            {(p) => <Input {...p} type="date" value={f.date} onChange={(e) => set("date", e.target.value)} disabled={!editable || timeLocked} />}
          </Field>
          <Field label="เวลา">
            {(p) => (
              <Select {...p} value={f.time} onChange={(e) => set("time", e.target.value)} disabled={!editable || timeLocked} className="font-mono">
                {(TIMES.includes(f.time) ? TIMES : [f.time, ...TIMES]).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="ระยะเวลา">
            {(p) => (
              <Select {...p} value={f.durationMin} onChange={(e) => set("durationMin", Number(e.target.value))} disabled={!editable}>
                {(DURATIONS.includes(f.durationMin) ? DURATIONS : [f.durationMin, ...DURATIONS]).map((d) => (
                  <option key={d} value={d}>
                    {d < 60 ? `${d} นาที` : `${d / 60} ชม.`}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ทันตแพทย์">
            {(p) => (
              <Select {...p} value={f.dentistId} onChange={(e) => set("dentistId", e.target.value)} disabled={!editable}>
                <option value="">เลือกทันตแพทย์…</option>
                {dentists.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="เก้าอี้">
            {(p) => (
              <Select {...p} value={f.chairId} onChange={(e) => set("chairId", e.target.value)} disabled={!editable}>
                <option value="">ยังไม่ระบุ</option>
                {chairs.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.status === "maintenance"}>
                    {c.name}
                    {c.status === "maintenance" ? " (ปิดซ่อม)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Field label="หัตถการ">
          {(p) => (
            <>
              <Input {...p} list="appt-procedures" value={f.procedure} onChange={(e) => set("procedure", e.target.value)} disabled={!editable} />
              <datalist id="appt-procedures">
                {PROCEDURES.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="หมายเหตุ">
          {(p) => <Textarea {...p} rows={2} value={f.note} onChange={(e) => set("note", e.target.value)} disabled={!editable} />}
        </Field>

        {error && <Alert>{error}</Alert>}

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
            {a?.status === "booked" && (
              <>
                {isToday && (
                  <Button variant="secondary" disabled={busy} onClick={() => setStatus("arrived", "")}>
                    <LogIn />
                    เช็กอิน
                  </Button>
                )}
                <Button variant="ghost" disabled={busy} onClick={() => setStatus("no_show", "บันทึกว่าไม่มาตามนัด")}>
                  <UserX />
                  ไม่มา
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setStatus("cancelled", "ยกเลิกนัดแล้ว")} className="text-danger hover:bg-danger-soft">
                  <Ban />
                  ยกเลิกนัด
                </Button>
              </>
            )}
            <span className="flex-1" />
            {editable && (
              <Button type="submit" disabled={busy}>
                {busy ? "กำลังบันทึก…" : a ? "บันทึกการแก้ไข" : "สร้างนัด"}
              </Button>
            )}
          </div>
        )}
      </form>
    </DialogContent>
  );
}
