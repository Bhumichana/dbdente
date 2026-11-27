"use client";

import { FilePlus2, FileSignature, FileText, Send, Tablet, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TeethInput } from "@/components/billing/inputs";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { useClinicRefs } from "@/lib/clinic";
import { thaiDate } from "@/lib/format";
import { setKioskLock } from "@/lib/kiosk";
import { useSocketEvent } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { CONSENT_STATUS, SIGNER_RELATION, type Consent, type ConsentTemplate } from "@/lib/types";

/** แท็บเอกสารยินยอมในแฟ้มคนไข้ */
export function PatientConsents({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [list, setList] = useState<Consent[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => api<Consent[]>(`/api/patients/${patientId}/consents`).then(setList), [patientId]);
  useEffect(() => {
    load();
  }, [load]);
  useSocketEvent<{ patientId: string }>("consent:changed", (e) => e.patientId === patientId && load(), load);

  async function act(c: Consent, action: "push" | "cancel") {
    setBusy(c.id);
    try {
      await api(`/api/consents/${c.id}/${action}`, { method: "POST" });
      toast(action === "push" ? "ส่งไปแท็บเล็ตแล้ว — แท็บเล็ตที่เปิดโหมด Kiosk จะแสดงเอกสารนี้" : "ยกเลิกเอกสารแล้ว");
      if (action === "cancel") load();
    } catch (e) {
      toast((e as ApiError).message, "error");
    } finally {
      setBusy(null);
    }
  }

  function signHere(c: Consent) {
    setKioskLock(true);
    router.push(`/kiosk?c=${c.id}`);
  }

  if (!list) return <Skeleton className="m-6 h-40" />;

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-ink-500">
          สร้างเอกสาร แล้วให้คนไข้เซ็นบนแท็บเล็ต (โหมด Kiosk) เอกสารที่เซ็นแล้วแก้ไขไม่ได้
        </p>
        <Button onClick={() => setCreating(true)}>
          <FilePlus2 />
          สร้างเอกสารยินยอม
        </Button>
      </div>

      {list.length === 0 && (
        <EmptyState icon={<FileSignature />} title="ยังไม่มีเอกสารยินยอม">
          เช่น หนังสือยินยอมรักษารากฟัน ถอนฟัน หรือความยินยอม PDPA
        </EmptyState>
      )}

      {list.map((c) => (
        <Card key={c.id} className="flex flex-wrap items-center gap-3 p-4">
          <FileText className="size-5 shrink-0 text-navy-600" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-ink-900">{c.title}</b>
              <Badge tone={CONSENT_STATUS[c.status].tone}>{CONSENT_STATUS[c.status].label}</Badge>
            </div>
            <p className="text-sm text-ink-500">
              {[c.procedure, c.teeth.length ? `ซี่ ${c.teeth.join(", ")}` : "", c.dentistName].filter(Boolean).join(" · ")}
            </p>
            <p className="text-xs text-ink-400">
              {c.status === "signed"
                ? `เซ็นโดย ${c.signerName} (${SIGNER_RELATION[c.signerRelation ?? "self"]}) · ${thaiDate(c.signedAt!, { dateStyle: "medium", timeStyle: "short" })}`
                : `สร้างโดย ${c.createdByName} · ${thaiDate(c.createdAt, { dateStyle: "medium", timeStyle: "short" })}`}
            </p>
          </div>
          {c.status === "pending" && (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" disabled={busy === c.id} onClick={() => act(c, "push")}>
                <Send />
                ส่งไปแท็บเล็ต
              </Button>
              <Button size="sm" variant="secondary" onClick={() => signHere(c)}>
                <Tablet />
                เซ็นบนเครื่องนี้
              </Button>
              <Button size="sm" variant="ghost" aria-label="ยกเลิกเอกสาร" disabled={busy === c.id} onClick={() => act(c, "cancel")}>
                <X />
              </Button>
            </div>
          )}
          {c.status === "signed" && (
            <Link href={`/patients/${patientId}/consents/${c.id}`} className={buttonClass("secondary", "sm")}>
              <FileText />
              ดู / พิมพ์
            </Link>
          )}
        </Card>
      ))}

      <Dialog open={creating} onOpenChange={setCreating}>
        {creating && (
          <CreateConsent
            patientId={patientId}
            onCreated={() => {
              setCreating(false);
              load();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function CreateConsent({ patientId, onCreated }: { patientId: string; onCreated: () => void }) {
  const me = useSession((s) => s.user);
  const { dentists } = useClinicRefs();
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [procedure, setProcedure] = useState("");
  const [teeth, setTeeth] = useState<number[]>([]);
  const [dentistId, setDentistId] = useState(me?.role === "dentist" || me?.role === "owner" ? me.id : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<ConsentTemplate[]>("/api/consent-templates").then(setTemplates);
  }, []);
  const t = templates.find((x) => x.id === templateId);

  return (
    <DialogContent title="สร้างเอกสารยินยอม" description="ข้อความในเอกสารจะถูกบันทึกไว้ทั้งชุดตอนสร้าง">
      <form
        className="grid gap-4 overflow-y-auto p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api(`/api/patients/${patientId}/consents`, { method: "POST", body: JSON.stringify({ templateId, procedure, teeth, dentistId }) });
            toast("สร้างเอกสารแล้ว — ส่งไปแท็บเล็ตเพื่อให้คนไข้เซ็น");
            onCreated();
          } catch (err) {
            setError((err as ApiError).message);
            setBusy(false);
          }
        }}
      >
        <Field label="เอกสาร">
          {(p) => (
            <Select {...p} required value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">เลือกเอกสาร</option>
              {templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {t && t.id !== "ct-pdpa" && (
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="หัตถการ" hint="แสดงในเอกสาร">
              {(p) => <Input {...p} value={procedure} maxLength={200} onChange={(e) => setProcedure(e.target.value)} placeholder="เช่น รักษารากฟัน" />}
            </Field>
            <Field label="ซี่">
              {(p) => <TeethInput {...p} value={teeth} onValue={setTeeth} />}
            </Field>
          </div>
        )}
        <Field label="ทันตแพทย์ผู้อธิบาย">
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
        {t && (
          <div className="max-h-40 overflow-y-auto rounded-lg bg-navy-50 p-3 text-sm text-ink-700">
            {t.body.slice(0, 2).map((b, i) => (
              <p key={i}>{b}</p>
            ))}
            <p className="text-ink-400">… และอีก {Math.max(0, t.body.length - 2)} ข้อ · ยินยอม {t.checks.length} รายการ</p>
          </div>
        )}
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || !templateId || !dentistId}>
            สร้างเอกสาร
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
