"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { ToothChart, type Dentition } from "@/components/chart/ToothChart";
import { ToothEditor } from "@/components/chart/ToothEditor";
import { XrayGallery } from "@/components/xray/XrayGallery";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { ToothRecord, XrayImage } from "@/lib/types";

// Cornerstone ใช้ WebGL/Web Worker — โหลดเฉพาะฝั่ง browser
const DicomViewer = dynamic(() => import("@/components/viewer/DicomViewer"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-viewer text-ink-500">กำลังเตรียม Viewer…</div>,
});

/**
 * ห้องตรวจ (จุดขายหลัก)
 *  ≥1280px : ผังฟัน | Viewer | ฟิล์ม + SOAP           (iPad Pro แนวนอน, PC)
 *  1024–1279: ผังฟัน + SOAP | ฟิล์ม (แถบ) + Viewer      (iPad Air แนวนอน)
 *  <1024    : เรียงลงมา                                  (iPad แนวตั้ง)
 */
export function TreatmentWorkspace({
  patientId,
  chart,
  images,
  selected,
  onSelect,
  openSops,
  onOpen,
  dentition,
  onDentition,
  canEditChart,
  canUpload,
  onSaveTooth,
  onImagesChanged,
  notesPanel,
}: {
  patientId: string;
  chart: Record<number, ToothRecord>;
  images: XrayImage[];
  selected: number | null;
  onSelect: (t: number | null) => void;
  openSops: string[];
  onOpen: (sops: string[]) => void;
  dentition: Dentition;
  onDentition: (d: Dentition) => void;
  canEditChart: boolean;
  canUpload: boolean;
  onSaveTooth: (r: ToothRecord) => Promise<void>;
  onImagesChanged: () => void;
  notesPanel: ReactNode;
}) {
  const wide = useMediaQuery("(min-width: 1280px)");

  const filmCount: Record<number, number> = {};
  for (const img of images) for (const t of img.teeth) filmCount[t] = (filmCount[t] ?? 0) + 1;
  const openImages = openSops
    .map((s) => images.find((i) => i.sopInstanceUid === s))
    .filter((x): x is XrayImage => !!x);

  const gallery = (layout: "strip" | "grid", className?: string) => (
    <XrayGallery
      layout={layout}
      className={className}
      patientId={patientId}
      images={images}
      selectedTooth={selected}
      openSops={openSops}
      canUpload={canUpload}
      canLink
      onOpen={onOpen}
      onChanged={onImagesChanged}
    />
  );

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[400px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)_300px]">
      <section className="min-h-0 space-y-3 overflow-y-auto border-ink-200 p-3 lg:border-r">
        <ToothChart
          records={chart}
          filmCount={filmCount}
          selected={selected}
          onSelect={onSelect}
          dentition={dentition}
          onDentition={onDentition}
        />
        {selected ? (
          <ToothEditor
            key={`${selected}-${chart[selected]?.updatedAt ?? ""}`}
            tooth={selected}
            record={chart[selected]}
            canEdit={canEditChart}
            onSave={onSaveTooth}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-ink-300 p-4 text-center text-sm text-ink-500">
            แตะซี่ฟันเพื่อดูฟิล์ม X-ray ของซี่นั้น และบันทึกการรักษา
          </p>
        )}
        {!wide && notesPanel}
      </section>

      <section className="flex min-h-[70vh] flex-col bg-viewer lg:min-h-0">
        {!wide && gallery("strip")}
        <div className="min-h-0 flex-1">
          {openImages.length > 0 ? (
            <DicomViewer patientId={patientId} images={openImages} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-ink-400">
              เลือกฟิล์มจากรายการ หรือแตะซี่ฟันที่มีป้ายเลขสีน้ำเงิน
            </div>
          )}
        </div>
      </section>

      {wide && (
        <aside className="flex min-h-0 flex-col border-l border-ink-200 bg-ink-50">
          {gallery("grid", "max-h-[55%] shrink-0")}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">{notesPanel}</div>
        </aside>
      )}
    </div>
  );
}
