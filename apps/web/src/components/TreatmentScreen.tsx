"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ToothChart, type Dentition } from "@/components/chart/ToothChart";
import { ToothEditor } from "@/components/chart/ToothEditor";
import { XrayGallery } from "@/components/xray/XrayGallery";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Patient, ToothRecord, XrayImage } from "@/lib/types";

// Cornerstone ใช้ WebGL/Web Worker — โหลดเฉพาะฝั่ง browser
const DicomViewer = dynamic(() => import("@/components/viewer/DicomViewer"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-viewer text-ink-500">กำลังเตรียม Viewer…</div>,
});

function age(birth: string) {
  const b = new Date(birth);
  const n = new Date();
  return n.getFullYear() - b.getFullYear() - (n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
}

export function TreatmentScreen() {
  const { id } = useParams<{ id: string }>();
  const role = useSession((s) => s.user?.role);
  const clinical = role === "owner" || role === "dentist" || role === "assistant";
  const canEditChart = role === "owner" || role === "dentist";

  const [patient, setPatient] = useState<Patient | null>(null);
  const [chart, setChart] = useState<Record<number, ToothRecord>>({});
  const [images, setImages] = useState<XrayImage[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [openSops, setOpenSops] = useState<string[]>([]);
  const [dentition, setDentition] = useState<Dentition>("permanent");
  const [error, setError] = useState<string | null>(null);
  const [pacsReadOnly, setPacsReadOnly] = useState(false);

  const loadImages = useCallback(
    () => api<XrayImage[]>(`/api/patients/${id}/images`).then(setImages),
    [id],
  );

  useEffect(() => {
    api<Patient>(`/api/patients/${id}`)
      .then((p) => {
        setPatient(p);
        const childAge = age(p.birthDate);
        setDentition(childAge < 6 ? "primary" : childAge < 13 ? "mixed" : "permanent");
      })
      .catch((e: ApiError) => setError(e.message));
    api<{ readOnly: boolean }>("/api/health").then((h) => setPacsReadOnly(h.readOnly));
    if (!clinical) return;
    api<ToothRecord[]>(`/api/patients/${id}/chart`).then((list) =>
      setChart(Object.fromEntries(list.map((r) => [r.tooth, r]))),
    );
    loadImages();
  }, [id, clinical, loadImages]);

  // เลือกซี่ฟัน → เปิดฟิล์มล่าสุดของซี่นั้นอัตโนมัติ (จุดขายหลัก)
  function selectTooth(t: number | null) {
    setSelected(t);
    if (t == null) return;
    const latest = images.find((i) => i.teeth.includes(t));
    if (latest) setOpenSops([latest.sopInstanceUid]);
  }

  const filmCount = useMemo(() => {
    const c: Record<number, number> = {};
    for (const img of images) for (const t of img.teeth) c[t] = (c[t] ?? 0) + 1;
    return c;
  }, [images]);

  const openImages = useMemo(
    () => openSops.map((s) => images.find((i) => i.sopInstanceUid === s)).filter((x): x is XrayImage => !!x),
    [openSops, images],
  );

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
  }

  if (error) {
    return (
      <>
        <AppHeader />
        <p className="m-6 rounded-lg bg-red-50 p-4 text-red-700">{error}</p>
      </>
    );
  }
  if (!patient) return <AppHeader />;

  const hasAlert = patient.allergies.length > 0 || patient.medicalAlerts.length > 0;

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader>
        <div className="flex items-center gap-3 truncate">
          <span className="font-mono text-sm text-navy-200">{patient.hn}</span>
          <span className="truncate font-semibold text-white">{patient.fullName}</span>
          <span className="text-sm text-navy-200">
            {patient.sex === "M" ? "ชาย" : "หญิง"} · {age(patient.birthDate)} ปี
          </span>
        </div>
      </AppHeader>

      {hasAlert && (
        <div role="alert" className="flex flex-wrap items-center gap-x-6 gap-y-1 bg-danger px-4 py-2 text-sm text-white">
          {patient.allergies.length > 0 && (
            <span>
              <b>⚠ แพ้ยา:</b> {patient.allergies.join(", ")}
            </span>
          )}
          {patient.medicalAlerts.length > 0 && (
            <span>
              <b>โรคประจำตัว/ข้อควรระวัง:</b> {patient.medicalAlerts.join(", ")}
            </span>
          )}
        </div>
      )}

      {!clinical ? (
        <div className="m-6 rounded-xl border border-ink-200 bg-white p-6 text-ink-600">
          บทบาทเคาน์เตอร์/การเงิน ไม่มีสิทธิ์ดูบันทึกการรักษาและฟิล์ม X-ray (ตาม RBAC ใน PRD)
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(420px,5fr)_7fr]">
          <section className="min-h-0 space-y-3 overflow-y-auto border-r border-ink-200 p-3">
            <ToothChart
              records={chart}
              filmCount={filmCount}
              selected={selected}
              onSelect={selectTooth}
              dentition={dentition}
              onDentition={setDentition}
            />
            {selected ? (
              <ToothEditor
                key={`${selected}-${chart[selected]?.updatedAt ?? ""}`}
                tooth={selected} record={chart[selected]} canEdit={canEditChart} onSave={saveTooth} />
            ) : (
              <p className="rounded-xl border border-dashed border-ink-300 p-4 text-center text-sm text-ink-500">
                แตะซี่ฟันเพื่อดูฟิล์ม X-ray ของซี่นั้น และบันทึกการรักษา
              </p>
            )}
          </section>

          <section className="flex min-h-[70vh] flex-col lg:min-h-0">
            <XrayGallery
              patientId={id}
              images={images}
              selectedTooth={selected}
              openSops={openSops}
              canUpload={clinical && !pacsReadOnly}
              canLink={clinical}
              onOpen={setOpenSops}
              onChanged={loadImages}
            />
            <div className="min-h-0 flex-1">
              {openImages.length > 0 ? (
                <DicomViewer patientId={id} images={openImages} />
              ) : (
                <div className="flex h-full items-center justify-center bg-viewer p-6 text-center text-ink-500">
                  เลือกฟิล์มจากแถบด้านบน หรือแตะซี่ฟันที่มีตัวเลขสีเขียว
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
