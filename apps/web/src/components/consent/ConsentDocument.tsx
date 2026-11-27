"use client";

import { ArrowLeft, BadgeCheck, Check, Printer, ShieldAlert, Square } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { api, ApiError } from "@/lib/api";
import { thaiDate } from "@/lib/format";
import { CONSENT_STATUS, SIGNER_RELATION, type Consent } from "@/lib/types";

/** เอกสารยินยอมฉบับที่เซ็นแล้ว — พิมพ์/บันทึก PDF จากเบราว์เซอร์ */
export function ConsentView() {
  const { id, cid } = useParams<{ id: string; cid: string }>();
  const [c, setC] = useState<Consent | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Consent>(`/api/consents/${cid}`).then(setC, (e: ApiError) => setError(e.message));
  }, [cid]);

  if (error) return <Alert className="m-6">{error}</Alert>;
  if (!c) return <Skeleton className="m-6 h-[600px] max-w-3xl" />;

  return (
    <div className="mx-auto grid max-w-3xl gap-4 p-4 sm:p-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/patients/${id}?tab=consent`} className={buttonClass("ghost", "sm")}>
          <ArrowLeft />
          แฟ้มคนไข้
        </Link>
        <span className="flex-1" />
        {c.status === "signed" &&
          (c.verified ? (
            <Badge tone="success">
              <BadgeCheck className="size-3.5" />
              เนื้อหาตรงกับตอนเซ็น
            </Badge>
          ) : (
            <Badge tone="danger-solid">
              <ShieldAlert className="size-3.5" />
              เนื้อหาไม่ตรงกับ hash
            </Badge>
          ))}
        <Button onClick={() => window.print()}>
          <Printer />
          พิมพ์ / บันทึก PDF
        </Button>
      </div>
      <ConsentDocument consent={c} />
    </div>
  );
}

export function ConsentDocument({ consent: c }: { consent: Consent }) {
  return (
    <article className="grid gap-4 rounded-xl border border-ink-200 bg-white p-6 text-[15px] leading-relaxed text-ink-900 sm:p-10 print:rounded-none print:border-0 print:p-0">
      <header className="grid gap-1 border-b border-ink-200 pb-4 text-center">
        <p className="text-sm text-ink-500">{c.clinicName}</p>
        <h1 className="text-xl font-semibold text-navy-900">{c.title}</h1>
        <p className="text-sm text-ink-600">
          {c.patient?.fullName} · <span className="font-mono">{c.patient?.hn}</span>
          {c.status !== "signed" && (
            <Badge tone={CONSENT_STATUS[c.status].tone} className="ml-2">
              {CONSENT_STATUS[c.status].label}
            </Badge>
          )}
        </p>
      </header>

      <ol className="grid list-decimal gap-2 pl-6">
        {c.body.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ol>

      <ul className="grid gap-1.5 rounded-lg bg-navy-50 p-4 print:bg-transparent print:p-0">
        {c.checks.map((k) => {
          const on = c.accepted?.[k.id];
          return (
            <li key={k.id} className="flex items-start gap-2">
              {on ? <Check className="mt-1 size-4 shrink-0 text-success" /> : <Square className="mt-1 size-4 shrink-0 text-ink-400" />}
              <span className={on ? "" : "text-ink-500"}>
                {k.label}
                {c.status === "signed" && !on && " — ไม่ยินยอม"}
              </span>
            </li>
          );
        })}
      </ul>

      {c.status === "signed" && (
        <footer className="grid gap-6 pt-2 sm:grid-cols-2">
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL ของลายเซ็น */}
            {c.signature && <img src={c.signature} alt={`ลายเซ็นของ ${c.signerName}`} className="mx-auto h-24 object-contain" />}
            <div className="border-t border-dotted border-ink-400 pt-1">
              {c.signerName} ({SIGNER_RELATION[c.signerRelation ?? "self"]})
            </div>
            <p className="text-sm text-ink-500">ลงนามเมื่อ {thaiDate(c.signedAt!, { dateStyle: "long", timeStyle: "medium" })}</p>
          </div>
          <div className="grid content-end gap-1 text-center text-sm">
            <div className="border-t border-dotted border-ink-400 pt-1">ทันตแพทย์ผู้อธิบาย · {c.dentistName}</div>
            <div className="text-ink-500">เจ้าหน้าที่ผู้จัดทำเอกสาร · {c.createdByName}</div>
          </div>
          <p className="col-span-full font-mono text-[10px] break-all text-ink-400">
            เลขที่เอกสาร {c.id} · SHA-256 {c.hash}
          </p>
        </footer>
      )}
    </article>
  );
}
