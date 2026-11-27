"use client";

import { FilePen, Lock, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { thaiDate } from "@/lib/format";
import type { SoapNote } from "@/lib/types";
import { QUICK_PHRASES, SOAP_TEMPLATES } from "./templates";

type Key = "subjective" | "objective" | "assessment" | "plan";

export const SOAP_FIELDS: { key: Key; letter: string; label: string }[] = [
  { key: "subjective", letter: "S", label: "อาการที่ผู้ป่วยแจ้ง" },
  { key: "objective", letter: "O", label: "การตรวจ / ภาพรังสี" },
  { key: "assessment", letter: "A", label: "การวินิจฉัย" },
  { key: "plan", letter: "P", label: "การรักษาที่ทำ / แผน" },
];

/** แสดงบันทึกแบบอ่านอย่างเดียว */
export function SoapView({ note, compact }: { note: SoapNote; compact?: boolean }) {
  return (
    <article className={cn("grid gap-2", compact ? "text-sm" : "")}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-ink-900">{thaiDate(note.visitDate)}</span>
        <span className="text-sm text-ink-500">{note.authorName}</span>
        {note.teeth.length > 0 && (
          <span className="font-mono text-sm text-navy-700">ซี่ {note.teeth.join(", ")}</span>
        )}
        <span className="flex-1" />
        {note.signedAt ? (
          <Badge tone="success">
            <Lock className="size-3" />
            ลงนามแล้ว
          </Badge>
        ) : (
          <Badge tone="warning">ร่าง</Badge>
        )}
      </header>
      <dl className="grid gap-1.5">
        {SOAP_FIELDS.filter((f) => note[f.key].trim()).map((f) => (
          <div key={f.key} className="grid grid-cols-[1.5rem_1fr] gap-2">
            <dt className="font-mono font-medium text-navy-700" title={f.label}>
              {f.letter}
            </dt>
            <dd className="whitespace-pre-line text-ink-800">{note[f.key]}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

/**
 * เขียน/แก้บันทึก SOAP ของ visit วันนี้
 * note = ร่างที่มีอยู่ (ยังไม่ลงนาม) หรือ null เมื่อยังไม่มี — กดบันทึกครั้งแรกจะสร้างใหม่
 * ผู้ใช้ต้อง remount ด้วย key เมื่อ note เปลี่ยน
 */
export function SoapEditor({
  patientId,
  note,
  selectedTooth,
  compact,
  onSaved,
}: {
  patientId: string;
  note: SoapNote | null;
  selectedTooth: number | null;
  compact?: boolean;
  onSaved: (n: SoapNote) => void;
}) {
  const [draft, setDraft] = useState({
    subjective: note?.subjective ?? "",
    objective: note?.objective ?? "",
    assessment: note?.assessment ?? "",
    plan: note?.plan ?? "",
    teeth: note?.teeth ?? (selectedTooth ? [selectedTooth] : []),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSign, setConfirmSign] = useState(false);
  const lastField = useRef<Key>("subjective");

  const dirty =
    !note ||
    SOAP_FIELDS.some((f) => draft[f.key] !== note[f.key]) ||
    draft.teeth.join() !== note.teeth.join();
  const empty = SOAP_FIELDS.every((f) => !draft[f.key].trim());
  const set = (k: Key, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  function applyTemplate(key: string) {
    const t = SOAP_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    const tooth = selectedTooth ? String(selectedTooth) : "";
    setDraft((d) => {
      const next = { ...d };
      for (const f of SOAP_FIELDS) if (!d[f.key].trim()) next[f.key] = t[f.key].replaceAll("{t}", tooth);
      if (selectedTooth && !d.teeth.includes(selectedTooth)) next.teeth = [...d.teeth, selectedTooth].sort();
      return next;
    });
  }

  function addPhrase(p: string) {
    const k = lastField.current;
    setDraft((d) => ({ ...d, [k]: d[k].trim() ? `${d[k].trimEnd()} · ${p}` : p }));
  }

  async function save(): Promise<SoapNote | null> {
    setBusy(true);
    setError(null);
    try {
      const saved = await api<SoapNote>(note ? `/api/patients/${patientId}/notes/${note.id}` : `/api/patients/${patientId}/notes`, {
        method: note ? "PUT" : "POST",
        body: JSON.stringify(draft),
      });
      return saved;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    const saved = await save();
    if (saved) {
      toast("บันทึกร่าง SOAP แล้ว");
      onSaved(saved);
    }
  }

  async function onSign() {
    const saved = dirty ? await save() : note;
    if (!saved) return;
    setBusy(true);
    try {
      const signed = await api<SoapNote>(`/api/patients/${patientId}/notes/${saved.id}/sign`, { method: "POST" });
      toast("ลงนามบันทึกการรักษาแล้ว");
      onSaved(signed);
    } catch (e) {
      setError((e as Error).message);
      setConfirmSign(false);
      if (saved !== note) onSaved(saved);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="ใช้เทมเพลต"
          value=""
          onChange={(e) => applyTemplate(e.target.value)}
          className={cn("w-auto min-w-0 flex-1", compact && "h-9")}
        >
          <option value="">เทมเพลตตามหัตถการ…</option>
          {SOAP_TEMPLATES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap items-center gap-1">
          {draft.teeth.map((t) => (
            <button
              key={t}
              onClick={() => setDraft((d) => ({ ...d, teeth: d.teeth.filter((x) => x !== t) }))}
              className="flex items-center gap-1 rounded-full bg-navy-100 py-0.5 pr-1.5 pl-2.5 font-mono text-xs text-navy-800 hover:bg-navy-200"
              title={`เอาซี่ ${t} ออก`}
            >
              {t}
              <X className="size-3" />
            </button>
          ))}
          {selectedTooth && !draft.teeth.includes(selectedTooth) && (
            <button
              onClick={() => setDraft((d) => ({ ...d, teeth: [...d.teeth, selectedTooth].sort() }))}
              className="flex items-center gap-1 rounded-full border border-dashed border-navy-300 px-2.5 py-0.5 font-mono text-xs text-navy-700 hover:bg-navy-50"
            >
              <Plus className="size-3" />
              {selectedTooth}
            </button>
          )}
        </div>
      </div>

      {SOAP_FIELDS.map((f) => (
        <label key={f.key} className="grid grid-cols-[1.75rem_1fr] items-start gap-2">
          <span
            className="mt-1.5 flex size-7 items-center justify-center rounded-md bg-navy-50 font-mono text-sm font-medium text-navy-700"
            title={f.label}
          >
            {f.letter}
          </span>
          <span className="grid gap-1">
            {!compact && <span className="text-xs text-ink-500">{f.label}</span>}
            <Textarea
              value={draft[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              onFocus={() => (lastField.current = f.key)}
              placeholder={compact ? f.label : undefined}
              rows={compact ? 2 : 3}
              className={cn(compact && "min-h-0 text-sm")}
            />
          </span>
        </label>
      ))}

      <div className="flex flex-wrap gap-1.5 pl-9">
        {QUICK_PHRASES.map((p) => (
          <button
            key={p}
            onMouseDown={(e) => e.preventDefault() /* คง focus ไว้ที่ช่องเดิม */}
            onClick={() => addPhrase(p)}
            className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-xs text-ink-600 hover:border-navy-200 hover:bg-navy-50"
          >
            + {p}
          </button>
        ))}
      </div>

      {error && <Alert>{error}</Alert>}

      {confirmSign ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          <span className="flex-1">ลงนามแล้วจะแก้ไขบันทึกนี้ไม่ได้อีก</span>
          <Button variant="ghost" size="sm" onClick={() => setConfirmSign(false)}>
            ยกเลิก
          </Button>
          <Button size="sm" disabled={busy} onClick={onSign}>
            <Lock />
            ยืนยันลงนาม
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy || empty || !dirty} onClick={onSave}>
            <FilePen />
            {busy ? "กำลังบันทึก…" : "บันทึกร่าง"}
          </Button>
          <Button
            disabled={busy || (!draft.assessment.trim() && !draft.plan.trim())}
            onClick={() => setConfirmSign(true)}
            title="ต้องมี A หรือ P ก่อนลงนาม"
          >
            <Lock />
            ลงนาม
          </Button>
        </div>
      )}
    </div>
  );
}
