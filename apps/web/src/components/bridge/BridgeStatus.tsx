"use client";

import { Cable, FileWarning, Link2, RefreshCw, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { thaiDate } from "@/lib/format";
import { BRIDGE_FILE, type Bridge, type BridgeFile } from "@/lib/types";

const ago = (iso: string | undefined, now: number) => {
  if (!iso) return "ไม่เคยติดต่อ";
  const m = Math.floor((now - Date.parse(iso)) / 60000);
  return m < 1 ? "เมื่อสักครู่" : m < 60 ? `${m} นาทีที่แล้ว` : m < 1440 ? `${Math.floor(m / 60)} ชม. ที่แล้ว` : thaiDate(iso, { day: "numeric", month: "short" });
};

/** สถานะ Local Bridge: เครื่อง X-ray ที่เชื่อมอยู่ · ไฟล์รอจับคู่ HN · ไฟล์ส่งไม่สำเร็จ (รีเฟรชทุก 15 วินาที) */
export function BridgeStatus() {
  const [data, setData] = useState<{ bridges: Bridge[]; files: BridgeFile[] } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [matching, setMatching] = useState<BridgeFile | null>(null);
  const load = useCallback(
    () =>
      api<{ bridges: Bridge[]; files: BridgeFile[] }>("/api/bridge").then((d) => {
        setData(d);
        setNow(Date.now());
      }),
    [],
  );
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function retry(f: BridgeFile) {
    try {
      await api(`/api/bridge/files/${f.id}/retry`, { method: "POST" });
      toast("สั่งส่งซ้ำแล้ว — Bridge จะส่งในรอบถัดไป");
      load();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  }

  if (!data) return <Skeleton className="m-6 h-64" />;
  const unmatched = data.files.filter((f) => f.status === "unmatched");
  const failed = data.files.filter((f) => f.status === "failed");
  const recent = data.files.filter((f) => !["unmatched", "failed"].includes(f.status)).slice(0, 20);

  return (
    <div className="mx-auto grid max-w-5xl gap-5 p-4 sm:p-6">
      <p className="text-sm text-ink-500">
        Local Bridge คือโปรแกรมที่ติดตั้งบนเครื่องในคลินิก รับไฟล์จากเครื่อง X-ray แล้วส่งเข้า PACS ให้อัตโนมัติ ถ้าอ่าน HN จากไฟล์ไม่ได้ ไฟล์จะรอให้เจ้าหน้าที่จับคู่ที่หน้านี้
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {data.bridges.map((b) => (
          <Card key={b.id} className="grid gap-2 p-4">
            <div className="flex items-center gap-2">
              <Cable className="size-5 text-navy-600" />
              <b className="flex-1 text-ink-900">{b.name}</b>
              <span className={cn("flex items-center gap-1.5 text-sm font-medium", b.online ? "text-success" : "text-ink-500")}>
                <span className={cn("size-2.5 rounded-full", b.online ? "bg-success" : "bg-ink-300")} />
                {b.online ? "ออนไลน์" : "ออฟไลน์"}
              </span>
            </div>
            <p className="text-sm text-ink-600">{b.device}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
              <span>ติดต่อล่าสุด {ago(b.lastSeenAt, now)}</span>
              {b.version && <span>เวอร์ชัน {b.version}</span>}
              <span>
                ส่งแล้ว 24 ชม. <span className="font-mono">{b.sentToday}</span>
              </span>
              {!!b.queue && (
                <span className="text-warning">
                  ค้างในเครื่อง <span className="font-mono">{b.queue}</span> ไฟล์
                </span>
              )}
            </div>
            {!b.online && <Alert tone="warning">ตรวจว่าเครื่องคอมพิวเตอร์ที่ติดตั้ง Bridge เปิดอยู่และต่ออินเทอร์เน็ต</Alert>}
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <ScanSearch className="size-4 text-warning" />
              รอจับคู่ HN <span className="font-mono text-ink-500">{unmatched.length}</span>
            </span>
          }
          description="อ่านข้อมูลคนไข้จากไฟล์ไม่ได้ หรือไม่ตรงกับ HN ในระบบ"
        />
        {unmatched.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-400">ไม่มีไฟล์รอจับคู่</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {unmatched.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm">{f.fileName}</p>
                  <p className="text-xs text-ink-500">
                    {f.bridgeName} · {f.modality} · รับเมื่อ {ago(f.receivedAt, now)}
                    {f.patientHint && <> · ข้อมูลในไฟล์: “{f.patientHint}”</>}
                  </p>
                </div>
                <Button size="sm" onClick={() => setMatching(f)}>
                  <Link2 />
                  จับคู่กับคนไข้
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {failed.length > 0 && (
        <Card className="border-danger/40">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <FileWarning className="size-4 text-danger" />
                ส่งไม่สำเร็จ <span className="font-mono text-ink-500">{failed.length}</span>
              </span>
            }
          />
          <ul className="divide-y divide-ink-100">
            {failed.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm">{f.fileName}</p>
                  <p className="text-xs text-danger">{f.error}</p>
                  <p className="text-xs text-ink-500">
                    {f.patient ? `${f.patient.fullName} (${f.patient.hn})` : "ยังไม่ระบุคนไข้"} · ลองแล้ว {f.attempts} ครั้ง
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => retry(f)}>
                  <RefreshCw />
                  ส่งซ้ำ
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="ไฟล์ล่าสุด" />
        <ul className="divide-y divide-ink-100">
          {recent.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono">{f.fileName}</span>
              {f.patient && (
                <Link href={`/patients/${f.patient.id}?tab=chart`} className="text-navy-700 hover:underline">
                  {f.patient.fullName}
                </Link>
              )}
              <Badge tone={BRIDGE_FILE[f.status].tone}>{BRIDGE_FILE[f.status].label}</Badge>
              <span className="w-28 text-right text-xs text-ink-400">{ago(f.updatedAt, now)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Dialog open={!!matching} onOpenChange={(o) => !o && setMatching(null)}>
        {matching && (
          <MatchDialog
            file={matching}
            onDone={() => {
              setMatching(null);
              load();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function MatchDialog({ file, onDone }: { file: BridgeFile; onDone: () => void }) {
  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <DialogContent title="จับคู่ไฟล์กับคนไข้" description={`${file.fileName}${file.patientHint ? ` · ข้อมูลในไฟล์: ${file.patientHint}` : ""}`}>
      <form
        className="grid gap-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api(`/api/bridge/files/${file.id}/match`, { method: "POST", body: JSON.stringify({ patientId: patient?.id }) });
            toast(`จับคู่กับ ${patient?.fullName} แล้ว — Bridge จะส่งเข้า PACS ในรอบถัดไป`);
            onDone();
          } catch (err) {
            setError((err as ApiError).message);
          }
        }}
      >
        <Field label="คนไข้">{(p) => <PatientPicker id={p.id} value={patient} onChange={setPatient} />}</Field>
        <p className="text-xs text-ink-500">ตรวจชื่อและวันที่ถ่ายให้ตรงก่อนยืนยัน ไฟล์จะถูกบันทึกเป็นของคนไข้รายนี้ (PatientID = รหัสคลินิก-HN)</p>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" disabled={!patient}>
            ยืนยันจับคู่
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
