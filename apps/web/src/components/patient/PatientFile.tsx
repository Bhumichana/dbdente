"use client";

import { ClipboardList, FileSignature, LayoutDashboard, NotebookPen, Receipt, ScanLine, TriangleAlert } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Dentition } from "@/components/chart/ToothChart";
import { TopbarSlot } from "@/components/shell/AppShell";
import { Badge } from "@/components/ui/badge";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { age } from "@/lib/age";
import { api, ApiError } from "@/lib/api";
import { todayTH } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Patient, Role, SoapNote, ToothRecord, XrayImage } from "@/lib/types";
import { OverviewTab, SoapTab, SoonPanel, TodayNotePanel } from "./panels";
import { TreatmentWorkspace } from "./TreatmentWorkspace";

const CLINICAL: Role[] = ["owner", "dentist", "assistant"];

const TABS = [
  { value: "overview", label: "ภาพรวม", icon: LayoutDashboard, roles: ["owner", "dentist", "receptionist", "assistant"] },
  { value: "chart", label: "ผังฟัน & ฟิล์ม", icon: ScanLine, roles: CLINICAL },
  { value: "soap", label: "บันทึกการรักษา", icon: NotebookPen, roles: CLINICAL },
  { value: "plan", label: "แผนการรักษา", icon: ClipboardList, roles: CLINICAL },
  { value: "billing", label: "การเงิน", icon: Receipt, roles: ["owner", "receptionist"] },
  { value: "consent", label: "เอกสารยินยอม", icon: FileSignature, roles: ["owner", "dentist", "receptionist", "assistant"] },
] as const satisfies { value: string; label: string; icon: unknown; roles: Role[] }[];

/** แฟ้มคนไข้: แถบแจ้งเตือน + แท็บ (แท็บที่เลือกอยู่ใน ?tab= เพื่อให้ลิงก์/ย้อนกลับได้) */
export function PatientFile() {
  const { id } = useParams<{ id: string }>();
  const user = useSession((s) => s.user);
  const role = user?.role;
  const clinical = !!role && CLINICAL.includes(role);
  const canWrite = role === "owner" || role === "dentist";

  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const tabs = TABS.filter((t) => role && (t.roles as readonly Role[]).includes(role));
  const tab = tabs.find((t) => t.value === search.get("tab"))?.value ?? (clinical ? "chart" : "overview");
  const go = (v: string) => router.replace(`${pathname}?tab=${v}`, { scroll: false });

  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chart, setChart] = useState<Record<number, ToothRecord>>({});
  const [images, setImages] = useState<XrayImage[]>([]);
  const [notes, setNotes] = useState<SoapNote[]>([]);
  const [pacsReadOnly, setPacsReadOnly] = useState(false);
  // สถานะห้องตรวจอยู่ที่นี่ → สลับแท็บแล้วกลับมายังอยู่ที่ซี่/ฟิล์มเดิม
  const [selected, setSelected] = useState<number | null>(null);
  const [openSops, setOpenSops] = useState<string[]>([]);
  const [dentition, setDentition] = useState<Dentition>("permanent");

  const loadImages = useCallback(() => api<XrayImage[]>(`/api/patients/${id}/images`).then(setImages), [id]);

  useEffect(() => {
    api<Patient>(`/api/patients/${id}`)
      .then((p) => {
        setPatient(p);
        const a = age(p.birthDate);
        setDentition(a < 6 ? "primary" : a < 13 ? "mixed" : "permanent");
      })
      .catch((e: ApiError) => setError(e.message));
    api<{ readOnly: boolean }>("/api/health").then((h) => setPacsReadOnly(h.readOnly));
    if (!clinical) return;
    api<ToothRecord[]>(`/api/patients/${id}/chart`).then((list) => setChart(Object.fromEntries(list.map((r) => [r.tooth, r]))));
    api<SoapNote[]>(`/api/patients/${id}/notes`).then(setNotes);
    loadImages();
  }, [id, clinical, loadImages]);

  // แตะซี่ฟัน → เปิดฟิล์มล่าสุดของซี่นั้นอัตโนมัติ
  function selectTooth(t: number | null) {
    setSelected(t);
    if (t == null) return;
    const latest = images.find((i) => i.teeth.includes(t));
    if (latest) setOpenSops([latest.sopInstanceUid]);
  }

  async function saveTooth(r: ToothRecord) {
    const saved = await api<ToothRecord | null>(`/api/patients/${id}/chart/${r.tooth}`, {
      method: "PUT",
      body: JSON.stringify(r),
    });
    setChart((c) => {
      const next = { ...c };
      if (saved) next[r.tooth] = saved;
      else delete next[r.tooth];
      return next;
    });
    toast(saved ? `บันทึกซี่ ${r.tooth} แล้ว` : `ล้างข้อมูลซี่ ${r.tooth} แล้ว`);
  }

  function upsertNote(n: SoapNote) {
    setNotes((list) => {
      const rest = list.filter((x) => x.id !== n.id);
      return [n, ...rest].sort((a, b) => b.visitDate.localeCompare(a.visitDate) || b.createdAt.localeCompare(a.createdAt));
    });
  }

  if (error) return <Alert className="m-4 sm:m-6">{error}</Alert>;
  if (!patient) {
    return (
      <div className="grid gap-3 p-6">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // ร่าง SOAP ของผู้ใช้คนนี้ใน visit วันนี้ (ยังไม่ลงนาม)
  const draft = notes.find((n) => n.visitDate === todayTH() && n.authorId === user?.id && !n.signedAt) ?? null;
  const hasAlert = patient.allergies.length > 0 || patient.medicalAlerts.length > 0;

  return (
    <div className="flex h-full flex-col">
      <TopbarSlot>
        <span aria-hidden className="hidden h-5 w-px bg-ink-200 lg:block" />
        <span className="flex min-w-0 items-center gap-3">
          <span className="hidden font-mono text-sm text-ink-500 sm:inline">{patient.hn}</span>
          <span className="truncate font-semibold text-ink-900">{patient.fullName}</span>
          <span className="hidden text-sm whitespace-nowrap text-ink-500 sm:inline">
            {patient.sex === "M" ? "ชาย" : "หญิง"} · {age(patient.birthDate)} ปี
          </span>
        </span>
      </TopbarSlot>

      {hasAlert && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-1 bg-danger px-4 py-2 text-sm text-white">
          {patient.allergies.length > 0 && (
            <span className="flex items-center gap-1.5">
              <TriangleAlert className="size-4" />
              <b>แพ้ยา:</b> {patient.allergies.join(", ")}
            </span>
          )}
          {patient.medicalAlerts.length > 0 && (
            <span>
              <b>โรคประจำตัว/ข้อควรระวัง:</b> {patient.medicalAlerts.join(", ")}
            </span>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={go} className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              <t.icon />
              {t.label}
              {t.value === "soap" && draft && (
                <Badge tone="warning" className="px-1.5 py-0 text-[10px]">
                  ร่าง
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="overflow-y-auto">
          <OverviewTab patient={patient} clinical={clinical} chart={chart} images={images} notes={notes} onGo={go} />
        </TabsContent>

        {clinical && (
          <>
            <TabsContent value="chart" className="flex flex-col data-[state=inactive]:hidden">
              <TreatmentWorkspace
                patientId={id}
                chart={chart}
                images={images}
                selected={selected}
                onSelect={selectTooth}
                openSops={openSops}
                onOpen={setOpenSops}
                dentition={dentition}
                onDentition={setDentition}
                canEditChart={canWrite}
                canUpload={!pacsReadOnly}
                onSaveTooth={saveTooth}
                onImagesChanged={loadImages}
                notesPanel={
                  <TodayNotePanel
                    patientId={id}
                    notes={notes}
                    draft={draft}
                    canWrite={canWrite}
                    selectedTooth={selected}
                    onSaved={upsertNote}
                  />
                }
              />
            </TabsContent>
            <TabsContent value="soap" className="overflow-y-auto">
              <SoapTab patientId={id} notes={notes} draft={draft} canWrite={canWrite} onSaved={upsertNote} />
            </TabsContent>
            <TabsContent value="plan" className="overflow-y-auto">
              <SoonPanel
                title="แผนการรักษาและใบเสนอราคา"
                phase="Phase 1"
                items={[
                  "รวมรายการ “แผนการรักษา” จากผังฟัน เรียงลำดับเป็น visit",
                  "ราคาตามรายการหัตถการของคลินิก และใบเสนอราคา",
                  "ให้คนไข้เซ็นรับแผนบนแท็บเล็ต",
                ]}
              />
            </TabsContent>
          </>
        )}

        <TabsContent value="billing" className="overflow-y-auto">
          <SoonPanel
            title="การเงินของคนไข้"
            phase="Phase 1"
            items={["บิลและใบเสร็จย้อนหลัง", "ยอดค้างชำระ และมัดจำคงเหลือ", "แผนผ่อนชำระ (จัดฟัน / รากเทียม) — Phase 2"]}
          />
        </TabsContent>
        <TabsContent value="consent" className="overflow-y-auto">
          <SoonPanel
            title="เอกสารยินยอม (E-Consent)"
            phase="Phase 1"
            items={["หนังสือยินยอมรับการรักษาตามหัตถการ", "ความยินยอม PDPA", "เซ็นบนแท็บเล็ตในโหมด Kiosk เก็บเป็น PDF"]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
