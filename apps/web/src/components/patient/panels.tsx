"use client";

import { Check, ClipboardList, FileImage, NotebookPen, Phone, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { SoapEditor, SoapView } from "@/components/soap/SoapNote";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { age } from "@/lib/age";
import { thaiDate } from "@/lib/format";
import { FILM_LABEL, type Patient, type SoapNote, type ToothRecord, type XrayImage } from "@/lib/types";

const SURF_TH: Record<string, string> = { M: "M", O: "O", D: "D", B: "B", L: "L" };

/** รายการแผนการรักษาที่ยังค้าง (สถานะ planned ในผังฟัน) */
export function plannedItems(chart: Record<number, ToothRecord>) {
  return Object.values(chart)
    .map((r) => {
      const surfaces = Object.entries(r.surfaces)
        .filter(([, st]) => st === "planned")
        .map(([s]) => SURF_TH[s]);
      const whole = r.whole === "planned";
      return surfaces.length || whole ? { tooth: r.tooth, procedure: r.procedure, surfaces, whole } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => a.tooth - b.tooth);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-ink-500">{label}</dt>
      <dd className="min-w-0 text-ink-900">{children}</dd>
    </div>
  );
}

export function OverviewTab({
  patient,
  clinical,
  chart,
  images,
  notes,
  onGo,
}: {
  patient: Patient;
  clinical: boolean;
  chart: Record<number, ToothRecord>;
  images: XrayImage[];
  notes: SoapNote[];
  onGo: (tab: string) => void;
}) {
  const plan = plannedItems(chart);
  const lastNote = notes.find((n) => n.signedAt) ?? notes[0];
  const byType = images.reduce<Record<string, number>>((a, i) => ((a[i.filmType] = (a[i.filmType] ?? 0) + 1), a), {});
  const latestFilm = [...images].sort((a, b) => b.studyDate.localeCompare(a.studyDate))[0];

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 p-4 sm:p-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="ข้อมูลคนไข้" />
        <dl className="divide-y divide-ink-100 px-4 py-2">
          <Row label="HN">
            <span className="font-mono">{patient.hn}</span>
          </Row>
          <Row label="ชื่อ-สกุล">{patient.fullName}</Row>
          <Row label="เพศ / อายุ">
            {patient.sex === "M" ? "ชาย" : "หญิง"} · {age(patient.birthDate)} ปี
          </Row>
          <Row label="วันเกิด">{thaiDate(patient.birthDate, { day: "numeric", month: "long", year: "numeric" })}</Row>
          <Row label="โทรศัพท์">
            {patient.phone ? (
              <span className="inline-flex items-center gap-1.5 font-mono">
                <Phone className="size-3.5 text-ink-400" />
                {patient.phone}
              </span>
            ) : (
              "–"
            )}
          </Row>
          {clinical && patient.dicomPatientId && (
            <Row label="PatientID (PACS)">
              <span className="font-mono text-ink-600">{patient.dicomPatientId}</span>
            </Row>
          )}
        </dl>
      </Card>

      <Card>
        <CardHeader title="การแจ้งเตือนทางการแพทย์" />
        <div className="grid gap-3 px-4 py-3">
          <div>
            <p className="mb-1.5 text-sm text-ink-500">แพ้ยา</p>
            {patient.allergies.length ? (
              <div className="flex flex-wrap gap-1.5">
                {patient.allergies.map((a) => (
                  <Badge key={a} tone="danger-solid" className="text-sm">
                    <TriangleAlert className="size-3.5" />
                    {a}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-700">ไม่มีประวัติแพ้ยา</p>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-sm text-ink-500">โรคประจำตัว / ข้อควรระวัง</p>
            {patient.medicalAlerts.length ? (
              <div className="flex flex-wrap gap-1.5">
                {patient.medicalAlerts.map((a) => (
                  <Badge key={a} tone="warning" className="text-sm">
                    {a}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-700">ไม่มี</p>
            )}
          </div>
        </div>
      </Card>

      {clinical ? (
        <>
          <Card>
            <CardHeader
              title="แผนการรักษาที่ค้าง"
              description={plan.length ? `${plan.length} ซี่` : undefined}
              actions={
                <Button variant="ghost" size="sm" onClick={() => onGo("chart")}>
                  เปิดผังฟัน
                </Button>
              }
            />
            {plan.length ? (
              <ul className="divide-y divide-ink-100">
                {plan.map((p) => (
                  <li key={p.tooth} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-8 font-mono font-medium text-red-600">{p.tooth}</span>
                    <span className="flex-1">{p.procedure || "ยังไม่ระบุหัตถการ"}</span>
                    <span className="font-mono text-xs text-ink-500">
                      {p.whole ? "ทั้งซี่" : `ด้าน ${p.surfaces.join("")}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 px-4 py-4 text-sm text-ink-500">
                <Check className="size-4 text-success" />
                ไม่มีแผนการรักษาค้าง
              </p>
            )}
          </Card>

          <Card>
            <CardHeader
              title="ฟิล์ม X-ray"
              description={latestFilm ? `ล่าสุด ${thaiDate(latestFilm.studyDate)}` : undefined}
              actions={
                <Button variant="ghost" size="sm" onClick={() => onGo("chart")}>
                  เปิด Viewer
                </Button>
              }
            />
            {images.length ? (
              <div className="flex flex-wrap gap-2 px-4 py-4">
                {Object.entries(byType).map(([t, n]) => (
                  <span key={t} className="inline-flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm">
                    <FileImage className="size-4 text-navy-500" />
                    {FILM_LABEL[t as keyof typeof FILM_LABEL]}
                    <span className="font-mono font-medium">{n}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="px-4 py-4 text-sm text-ink-500">ยังไม่มีฟิล์มของคนไข้รายนี้</p>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader
              title="บันทึกการรักษาล่าสุด"
              actions={
                <Button variant="ghost" size="sm" onClick={() => onGo("soap")}>
                  ดูทั้งหมด ({notes.length})
                </Button>
              }
            />
            <div className="px-4 py-3">
              {lastNote ? <SoapView note={lastNote} /> : <p className="text-sm text-ink-500">ยังไม่มีบันทึกการรักษา</p>}
            </div>
          </Card>
        </>
      ) : (
        <Card className="lg:col-span-2">
          <CardHeader title="นัดหมายและการเงิน" />
          <p className="px-4 py-4 text-sm text-ink-500">
            นัดหมายครั้งถัดไป ยอดค้างชำระ และมัดจำของคนไข้จะแสดงที่นี่ (Phase 1)
          </p>
        </Card>
      )}
    </div>
  );
}

/** แผง SOAP ในห้องตรวจ: เขียนบันทึก visit วันนี้ (ทันตแพทย์) หรือดูบันทึกล่าสุด (ผู้ช่วย) */
export function TodayNotePanel({
  patientId,
  notes,
  draft,
  canWrite,
  selectedTooth,
  onSaved,
}: {
  patientId: string;
  notes: SoapNote[];
  draft: SoapNote | null;
  canWrite: boolean;
  selectedTooth: number | null;
  onSaved: (n: SoapNote) => void;
}) {
  return (
    <Card className="p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-900">
        <NotebookPen className="size-4 text-navy-600" />
        {canWrite ? "SOAP · วันนี้" : "บันทึกการรักษาล่าสุด"}
        {draft && <Badge tone="warning">ร่าง</Badge>}
      </h3>
      {canWrite ? (
        <SoapEditor
          key={draft ? `${draft.id}-${draft.updatedAt}` : `new-${notes.length}`}
          patientId={patientId}
          note={draft}
          selectedTooth={selectedTooth}
          compact
          onSaved={onSaved}
        />
      ) : notes[0] ? (
        <SoapView note={notes[0]} compact />
      ) : (
        <p className="text-sm text-ink-500">ยังไม่มีบันทึก</p>
      )}
    </Card>
  );
}

export function SoapTab({
  patientId,
  notes,
  draft,
  canWrite,
  onSaved,
}: {
  patientId: string;
  notes: SoapNote[];
  draft: SoapNote | null;
  canWrite: boolean;
  onSaved: (n: SoapNote) => void;
}) {
  const history = notes.filter((n) => n.id !== draft?.id);
  return (
    <div className="mx-auto grid w-full max-w-6xl items-start gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {canWrite && (
        <Card className="lg:sticky lg:top-4">
          <CardHeader
            title="บันทึก visit วันนี้"
            description={draft ? `ร่างล่าสุด ${new Date(draft.updatedAt).toLocaleTimeString("th-TH", { timeStyle: "short" })} น.` : "ยังไม่ได้เริ่ม"}
          />
          <div className="p-4">
            <SoapEditor
              key={draft ? `${draft.id}-${draft.updatedAt}` : `new-${notes.length}`}
              patientId={patientId}
              note={draft}
              selectedTooth={null}
              onSaved={onSaved}
            />
          </div>
        </Card>
      )}
      <section className={canWrite ? "" : "lg:col-span-2"}>
        <h2 className="mb-3 font-semibold text-ink-900">
          ประวัติการรักษา <span className="font-mono text-sm font-normal text-ink-500">{history.length} ครั้ง</span>
        </h2>
        {history.length ? (
          <ol className="relative grid gap-3 border-l-2 border-navy-100 pl-4">
            {history.map((n) => (
              <li key={n.id} className="relative">
                <span className="absolute top-5 -left-[1.4rem] size-3 rounded-full border-2 border-white bg-navy-500" />
                <Card className="p-4">
                  <SoapView note={n} />
                </Card>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState icon={<ClipboardList />} title="ยังไม่มีประวัติการรักษา" />
        )}
      </section>
    </div>
  );
}

export function SoonPanel({ title, phase, items }: { title: string; phase: string; items: string[] }) {
  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-semibold text-ink-900">{title}</h2>
          <Badge tone="navy">{phase}</Badge>
        </div>
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i} className="flex gap-2.5 text-sm text-ink-700">
              <Check className="mt-0.5 size-4 shrink-0 text-navy-500" />
              {i}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-500">ส่วนนี้อยู่ในแผนพัฒนา ยังไม่เปิดใช้ในเดโม</p>
      </Card>
    </div>
  );
}
