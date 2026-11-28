"use client";

import { CreditCard, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { age } from "@/lib/age";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Patient } from "@/lib/types";

const COMMON_ALLERGIES = ["Penicillin", "Amoxicillin", "Ibuprofen", "Aspirin", "Sulfa", "Lidocaine"];
const COMMON_ALERTS = ["เบาหวาน", "ความดันโลหิตสูง", "โรคหัวใจ", "ทานยาละลายลิ่มเลือด (Warfarin)", "หอบหืด", "ตั้งครรภ์"];

/** แสดงเลขบัตรแบบ 1-2345-67890-12-3 */
const fmtCid = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 13);
  return [d.slice(0, 1), d.slice(1, 5), d.slice(5, 10), d.slice(10, 12), d.slice(12)].filter(Boolean).join("-");
};

function TagInput({
  id,
  values,
  onChange,
  suggestions,
  placeholder,
  tone,
}: {
  id: string;
  values: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  placeholder: string;
  tone: "danger" | "warning";
}) {
  const [text, setText] = useState("");
  const add = (v: string) => {
    const t = v.trim();
    if (t && !values.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...values, t]);
    setText("");
  };
  const chip = tone === "danger" ? "bg-danger text-white" : "bg-warning-soft text-warning";
  return (
    <div className="grid gap-2">
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-ink-300 bg-white px-2 py-1.5 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
        {values.map((v) => (
          <span key={v} className={cn("inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-sm font-medium", chip)}>
            {v}
            <button type="button" aria-label={`ลบ ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="rounded-full p-0.5 hover:bg-black/10">
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={() => text && add(text)}
          placeholder={values.length ? "" : placeholder}
          className="h-7 min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions
          .filter((s) => !values.includes(s))
          .map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => add(s)}
              className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-xs text-ink-600 hover:border-navy-200 hover:bg-navy-50"
            >
              <Plus className="size-3" />
              {s}
            </button>
          ))}
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="grid gap-4 p-5 md:grid-cols-[13rem_1fr]">
      <div>
        <h2 className="font-semibold text-ink-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

/** ฟอร์มลงทะเบียน / แก้ไขข้อมูลคนไข้ (เคาน์เตอร์ · เจ้าของคลินิก) */
export function PatientForm({ patient }: { patient?: Patient }) {
  const router = useRouter();
  const [f, setF] = useState({
    fullName: patient?.fullName ?? "",
    sex: patient?.sex ?? ("" as Patient["sex"] | ""),
    birthDate: patient?.birthDate ?? "",
    citizenId: fmtCid(patient?.citizenId ?? ""),
    phone: patient?.phone ?? "",
    address: patient?.address ?? "",
    allergies: patient?.allergies ?? [],
    noAllergy: patient ? patient.allergies.length === 0 : false,
    medicalAlerts: patient?.medicalAlerts ?? [],
    ecName: patient?.emergencyContact?.name ?? "",
    ecRelation: patient?.emergencyContact?.relation ?? "",
    ecPhone: patient?.emergencyContact?.phone ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    // แก้ช่องไหน ล้างข้อความ error ของช่องนั้น
    const key = k === "noAllergy" ? "allergies" : k;
    if (errors[key]) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([n]) => n !== key)));
  };

  function validate() {
    const e: Record<string, string> = {};
    if (f.fullName.trim().length < 2) e.fullName = "กรอกชื่อ-นามสกุล";
    if (!f.sex) e.sex = "เลือกเพศ";
    if (!f.birthDate) e.birthDate = "กรอกวันเกิด";
    if (f.citizenId && f.citizenId.replace(/\D/g, "").length !== 13) e.citizenId = "เลขบัตรต้องมี 13 หลัก";
    if (!f.noAllergy && f.allergies.length === 0) e.allergies = "ระบุยาที่แพ้ หรือเลือก “ไม่มีประวัติแพ้ยา”";
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) {
      document.getElementById(`f-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const body = {
        fullName: f.fullName,
        sex: f.sex,
        birthDate: f.birthDate,
        citizenId: f.citizenId.replace(/\D/g, ""),
        phone: f.phone,
        address: f.address,
        allergies: f.noAllergy ? [] : f.allergies,
        medicalAlerts: f.medicalAlerts,
        emergencyContact: { name: f.ecName, relation: f.ecRelation, phone: f.ecPhone },
      };
      const saved = await api<Patient>(patient ? `/api/patients/${patient.id}` : "/api/patients", {
        method: patient ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      toast(patient ? "บันทึกข้อมูลคนไข้แล้ว" : `ลงทะเบียนแล้ว · ${saved.hn}`);
      router.push(`/patients/${saved.id}?tab=overview`);
    } catch (err) {
      const e = err as ApiError;
      const body = e.body as { field?: string; existingId?: string } | undefined;
      if (body?.field) setErrors({ [body.field === "emergencyPhone" ? "ecPhone" : body.field]: e.message });
      setFormError(
        body?.existingId ? (
          <>
            {e.message} ·{" "}
            <Link className="font-medium underline" href={`/patients/${body.existingId}?tab=overview`}>
              เปิดแฟ้มที่มีอยู่
            </Link>
          </>
        ) : (
          e.message
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  const fp = (name: string) => ({ id: `f-${name}`, "aria-invalid": errors[name] ? true : undefined });

  return (
    <form onSubmit={submit} noValidate className="mx-auto grid w-full max-w-4xl gap-4 p-4 pb-28 sm:p-6 sm:pb-28">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{patient ? `แก้ไขข้อมูล · ${patient.hn}` : "ลงทะเบียนคนไข้ใหม่"}</h1>
        {!patient && <span className="text-sm text-ink-500">ระบบออก HN ให้อัตโนมัติ</span>}
        <span className="flex-1" />
        <Button variant="secondary" disabled title="ต้องติดตั้ง DBDenté Bridge ที่เครื่องเคาน์เตอร์ (Phase 2)">
          <CreditCard />
          อ่านจากบัตรประชาชน
        </Button>
      </div>

      <Section title="ข้อมูลส่วนตัว">
        <Field label="ชื่อ-นามสกุล *" error={errors.fullName} className="sm:col-span-2">
          {(p) => <Input {...p} {...fp("fullName")} value={f.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="off" />}
        </Field>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium text-ink-700">เพศ *</span>
          <div id="f-sex" tabIndex={-1} role="radiogroup" aria-label="เพศ" className="flex gap-2">
            {(["M", "F"] as const).map((s) => (
              <button
                type="button"
                key={s}
                role="radio"
                aria-checked={f.sex === s}
                onClick={() => set("sex", s)}
                className={cn(
                  "h-10 flex-1 rounded-lg border text-sm",
                  f.sex === s ? "border-navy-700 bg-navy-700 font-medium text-white" : "border-ink-300 bg-white hover:bg-navy-50",
                  errors.sex && f.sex !== s && "border-danger",
                )}
              >
                {s === "M" ? "ชาย" : "หญิง"}
              </button>
            ))}
          </div>
          {errors.sex && <p className="text-xs text-danger">{errors.sex}</p>}
        </div>
        <Field label="วันเกิด *" error={errors.birthDate} hint={f.birthDate && !errors.birthDate ? `อายุ ${age(f.birthDate)} ปี` : undefined}>
          {(p) => <Input {...p} {...fp("birthDate")} type="date" value={f.birthDate} onChange={(e) => set("birthDate", e.target.value)} />}
        </Field>
        <Field label="เลขบัตรประชาชน" error={errors.citizenId} className="sm:col-span-2">
          {(p) => (
            <Input
              {...p}
              {...fp("citizenId")}
              inputMode="numeric"
              value={f.citizenId}
              onChange={(e) => set("citizenId", fmtCid(e.target.value))}
              placeholder="1-2345-67890-12-3"
              className="font-mono sm:max-w-64"
            />
          )}
        </Field>
      </Section>

      <Section title="การติดต่อ">
        <Field label="โทรศัพท์" error={errors.phone}>
          {(p) => <Input {...p} {...fp("phone")} type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="081-234-5678" className="font-mono" />}
        </Field>
        <div className="hidden sm:block" />
        <Field label="ที่อยู่" className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} />}
        </Field>
      </Section>

      <Section title="ประวัติสุขภาพ" description="แสดงเป็นแถบแดงทุกครั้งที่เปิดแฟ้มคนไข้ ต้องถามคนไข้ทุกครั้งที่ลงทะเบียน">
        <div className="grid gap-2 sm:col-span-2">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="f-allergies" className="text-sm font-medium text-ink-700">
              แพ้ยา *
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={f.noAllergy}
                onChange={(e) => {
                  if (e.target.checked) set("allergies", []);
                  set("noAllergy", e.target.checked);
                }}
                className="size-4 accent-navy-700"
              />
              ไม่มีประวัติแพ้ยา
            </label>
          </div>
          {!f.noAllergy && (
            <TagInput
              id="f-allergies"
              values={f.allergies}
              onChange={(v) => set("allergies", v)}
              suggestions={COMMON_ALLERGIES}
              placeholder="พิมพ์ชื่อยาแล้วกด Enter"
              tone="danger"
            />
          )}
          {errors.allergies && <p className="text-xs text-danger">{errors.allergies}</p>}
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <label htmlFor="f-alerts" className="text-sm font-medium text-ink-700">
            โรคประจำตัว / ข้อควรระวัง
          </label>
          <TagInput
            id="f-alerts"
            values={f.medicalAlerts}
            onChange={(v) => set("medicalAlerts", v)}
            suggestions={COMMON_ALERTS}
            placeholder="พิมพ์แล้วกด Enter"
            tone="warning"
          />
        </div>
      </Section>

      <Section title="ผู้ติดต่อฉุกเฉิน">
        <Field label="ชื่อ">{(p) => <Input {...p} value={f.ecName} onChange={(e) => set("ecName", e.target.value)} />}</Field>
        <Field label="ความสัมพันธ์">{(p) => <Input {...p} value={f.ecRelation} onChange={(e) => set("ecRelation", e.target.value)} placeholder="เช่น ภรรยา, บุตร" />}</Field>
        <Field label="โทรศัพท์" error={errors.ecPhone}>
          {(p) => <Input {...p} {...fp("ecPhone")} type="tel" inputMode="tel" value={f.ecPhone} onChange={(e) => set("ecPhone", e.target.value)} className="font-mono" />}
        </Field>
      </Section>

      <div className="fixed right-0 bottom-0 left-0 z-20 border-t border-ink-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:left-16 xl:left-60">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
          {formError ? <Alert className="min-w-0 flex-1 py-2">{formError}</Alert> : <span className="flex-1" />}
          <Link href={patient ? `/patients/${patient.id}?tab=overview` : "/patients"} className={buttonClass("ghost")}>
            ยกเลิก
          </Link>
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "กำลังบันทึก…" : patient ? "บันทึกการแก้ไข" : "ลงทะเบียน"}
          </Button>
        </div>
      </div>
    </form>
  );
}
