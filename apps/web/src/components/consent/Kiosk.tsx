"use client";

import { CircleCheckBig, Lock, Tablet } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { setKioskLock } from "@/lib/kiosk";
import { homeFor } from "@/lib/nav";
import { useSocketEvent } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { SIGNER_RELATION, type Consent } from "@/lib/types";
import { SignaturePad } from "./SignaturePad";

type Relation = keyof typeof SIGNER_RELATION;

/**
 * โหมด Kiosk บนแท็บเล็ต: คนไข้อ่าน ติ๊กยินยอม และเซ็น
 * ไม่มีเมนู ไม่แสดงข้อมูลอื่นของคลินิก · ออกได้ด้วย PIN พนักงานเท่านั้น
 * รับเอกสารได้ 2 ทาง: ?c=<id> (เซ็นบนเครื่องเดียวกัน) หรือเจ้าหน้าที่กด "ส่งไปแท็บเล็ต" (real-time)
 */
export function Kiosk() {
  const router = useRouter();
  const token = useSession((s) => s.token);
  const initial = useSearchParams().get("c");
  const [consentId, setConsentId] = useState<string | null>(initial);
  const [doc, setDoc] = useState<Consent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    if (!token) router.replace("/");
    else setKioskLock(true);
  }, [token, router]);

  useEffect(() => {
    if (!consentId) return;
    api<Consent>(`/api/consents/${consentId}`).then(
      (c) => {
        if (c.status !== "pending") {
          setError(c.status === "signed" ? "เอกสารนี้เซ็นแล้ว" : "เอกสารนี้ถูกยกเลิกแล้ว");
          setDoc(null);
        } else {
          setDoc(c);
          setError(null);
        }
      },
      (e: ApiError) => setError(e.message),
    );
  }, [consentId]);

  const live = useSocketEvent<{ consentId: string }>("kiosk:open", (e) => {
    setDone(false);
    setConsentId(e.consentId);
  });

  const reset = useCallback(() => {
    setDoc(null);
    setConsentId(null);
    setDone(false);
    setError(null);
    router.replace("/kiosk");
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col bg-white text-ink-900">
      <header className="flex items-center gap-3 bg-navy-950 px-5 py-3 text-white">
        <Tablet className="size-5 text-navy-200" />
        <span className="font-semibold">{doc?.clinicName ?? "เอกสารยินยอม"}</span>
        <span className={cn("ml-2 size-2 rounded-full", live ? "bg-success" : "bg-ink-500")} aria-label={live ? "เชื่อมต่อแล้ว" : "ออฟไลน์"} />
        <span className="flex-1" />
        <button onClick={() => setUnlocking(true)} aria-label="ออกจากโหมด Kiosk (เจ้าหน้าที่)" className="rounded-lg p-2 text-navy-200 hover:bg-navy-800">
          <Lock className="size-5" />
        </button>
      </header>

      {done ? (
        <Center>
          <CircleCheckBig className="size-20 text-success" />
          <h1 className="text-3xl font-semibold">ลงนามเรียบร้อย ขอบคุณค่ะ</h1>
          <p className="text-xl text-ink-600">กรุณาส่งแท็บเล็ตคืนเจ้าหน้าที่</p>
          <Button size="lg" variant="secondary" onClick={reset} className="mt-4">
            กลับหน้ารอ
          </Button>
        </Center>
      ) : doc ? (
        <SignForm
          key={doc.id}
          doc={doc}
          onSigned={() => {
            setDone(true);
            setTimeout(reset, 8000);
          }}
        />
      ) : (
        <Center>
          <Tablet className="size-20 text-navy-200" />
          <h1 className="text-3xl font-semibold text-navy-900">กรุณารอเจ้าหน้าที่ส่งเอกสาร</h1>
          <p className="text-lg text-ink-500">เอกสารจะแสดงที่หน้าจอนี้โดยอัตโนมัติ</p>
          {error && <Alert className="mt-4 text-base">{error}</Alert>}
        </Center>
      )}

      <Dialog open={unlocking} onOpenChange={setUnlocking}>
        {unlocking && (
          <UnlockDialog
            onUnlocked={() => {
              setKioskLock(false);
              router.replace(homeFor(useSession.getState().user?.role));
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">{children}</main>;
}

function SignForm({ doc, onSigned }: { doc: Consent; onSigned: () => void }) {
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [relation, setRelation] = useState<Relation>("self");
  const [signerName, setSignerName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atEnd, setAtEnd] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // ข้อความสั้นพอไม่ต้องเลื่อน → ถือว่าอ่านถึงท้ายแล้ว (เช็กใน callback ของ ResizeObserver)
  useEffect(() => {
    const el = scroller.current!;
    const ro = new ResizeObserver(() => el.scrollHeight <= el.clientHeight + 8 && setAtEnd(true));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const missing = doc.checks.filter((k) => k.required && !accepted[k.id]);
  const ready = !missing.length && !!signature && (relation === "self" || signerName.trim().length > 1);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/consents/${doc.id}/sign`, {
        method: "POST",
        body: JSON.stringify({ accepted, signature, signerRelation: relation, signerName: relation === "self" ? undefined : signerName }),
      });
      onSigned();
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(360px,44%)]">
      <section className="relative flex min-h-0 flex-col border-b border-ink-200 md:border-r md:border-b-0">
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setAtEnd(true);
          }}
          className="max-h-[45dvh] flex-1 overflow-y-auto px-6 py-6 text-[18px] leading-[1.85] md:max-h-none sm:px-10"
        >
          <h1 className="mb-1 text-2xl font-semibold text-navy-900">{doc.title}</h1>
          <p className="mb-5 text-base text-ink-500">
            {doc.patient?.fullName}
            {doc.dentistName && <> · ทันตแพทย์ {doc.dentistName}</>}
          </p>
          <ol className="grid list-decimal gap-3 pl-6 text-[#2b3a52]">
            {doc.body.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </div>
        {!atEnd && (
          <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/95 pt-8 pb-3 text-center text-base text-navy-700">
            เลื่อนอ่านต่อ ↓
          </p>
        )}
      </section>

      <section className="grid content-start gap-5 overflow-y-auto bg-navy-50 px-6 py-6 sm:px-8">
        <fieldset className="grid gap-3">
          <legend className="sr-only">ความยินยอม</legend>
          {doc.checks.map((k) => (
            <label key={k.id} className="flex cursor-pointer items-start gap-3 rounded-xl bg-white p-3 text-[17px] leading-snug shadow-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-7 shrink-0 accent-navy-700"
                checked={!!accepted[k.id]}
                onChange={(e) => setAccepted((a) => ({ ...a, [k.id]: e.target.checked }))}
              />
              <span>
                {k.label}
                {k.required && <span className="text-danger"> *</span>}
              </span>
            </label>
          ))}
        </fieldset>

        <div className="grid gap-2">
          <span className="text-base font-medium">ผู้ลงนาม</span>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {(Object.keys(SIGNER_RELATION) as Relation[]).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={relation === r}
                onClick={() => setRelation(r)}
                className={cn(
                  "min-h-12 rounded-xl border px-2 text-[15px]",
                  relation === r ? "border-navy-700 bg-navy-700 text-white" : "border-ink-200 bg-white text-ink-700",
                )}
              >
                {SIGNER_RELATION[r]}
              </button>
            ))}
          </div>
          {relation === "self" ? (
            <p className="text-base text-ink-600">{doc.patient?.fullName}</p>
          ) : (
            <Input
              aria-label="ชื่อ-นามสกุลผู้ลงนามแทน"
              placeholder="ชื่อ-นามสกุลผู้ลงนามแทน"
              value={signerName}
              maxLength={100}
              onChange={(e) => setSignerName(e.target.value)}
              className="h-12 text-base"
            />
          )}
        </div>

        <SignaturePad onChange={setSignature} className="h-48" />

        {error && <Alert className="text-base">{error}</Alert>}
        <Button size="lg" className="h-14 text-lg" disabled={busy || !ready} onClick={submit}>
          ยืนยันและลงนาม
        </Button>
        {!ready && (
          <p className="text-center text-sm text-ink-500">
            {missing.length ? "ติ๊กช่องที่มีเครื่องหมาย * ให้ครบ" : !signature ? "เซ็นชื่อในกรอบด้านบน" : "กรอกชื่อผู้ลงนามแทน"}
          </p>
        )}
      </section>
    </main>
  );
}

function UnlockDialog({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <DialogContent title="ออกจากโหมด Kiosk" description="สำหรับเจ้าหน้าที่ ใส่ PIN ของคลินิก">
      <form
        className="grid gap-3 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/api/kiosk/unlock", { method: "POST", body: JSON.stringify({ pin }) });
            onUnlocked();
          } catch (err) {
            setError((err as ApiError).message);
            setPin("");
            setBusy(false);
          }
        }}
      >
        <Input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-label="PIN"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="h-14 text-center font-mono text-2xl tracking-[0.5em]"
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" disabled={busy || pin.length < 4}>
          ปลดล็อก
        </Button>
      </form>
    </DialogContent>
  );
}
