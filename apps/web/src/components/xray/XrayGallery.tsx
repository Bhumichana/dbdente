"use client";

import { useEffect, useRef, useState } from "react";
import { api, fetchBlobUrl } from "@/lib/api";
import { FILM_LABEL, type FilmType, type XrayImage } from "@/lib/types";

const fmtDate = (d: string) => (d.length === 8 ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(2, 4)}` : d);

function Thumb({ patientId, sop }: { patientId: string; sop: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    fetchBlobUrl(`/api/patients/${patientId}/images/${sop}/thumbnail`)
      .then((u) => setSrc((url = u)))
      .catch(() => setFailed(true));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [patientId, sop]);
  if (failed) return <div className="flex h-full items-center justify-center text-xs text-ink-500">DICOM</div>;
  if (!src) return <div className="h-full animate-pulse bg-viewer-raised" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-full w-full object-contain" draggable={false} />;
}

interface Props {
  patientId: string;
  images: XrayImage[];
  selectedTooth: number | null;
  openSops: string[];
  canUpload: boolean;
  canLink: boolean;
  onOpen: (sops: string[]) => void;
  onChanged: () => void;
}

export function XrayGallery({ patientId, images, selectedTooth, openSops, canUpload, canLink, onOpen, onChanged }: Props) {
  const [type, setType] = useState<FilmType | "ALL">("ALL");
  const [compare, setCompare] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<FilmType>("PA");
  const fileRef = useRef<HTMLInputElement>(null);

  const [showAll, setShowAll] = useState(false);
  const byTooth =
    selectedTooth && !showAll
      ? images.filter((i) => i.teeth.includes(selectedTooth) || i.filmType === "PANO")
      : images;
  const list = byTooth.filter((i) => type === "ALL" || i.filmType === type);
  const types = [...new Set(images.map((i) => i.filmType))];

  function toggleCompare(sop: string) {
    setCompare((c) => (c.includes(sop) ? c.filter((x) => x !== sop) : [...c, sop].slice(-2)));
  }

  async function toggleLink(img: XrayImage) {
    if (!selectedTooth) return;
    const teeth = img.teeth.includes(selectedTooth)
      ? img.teeth.filter((t) => t !== selectedTooth)
      : [...img.teeth, selectedTooth];
    setBusy(img.sopInstanceUid);
    try {
      await api(`/api/patients/${patientId}/images/${img.sopInstanceUid}/link`, {
        method: "PUT",
        body: JSON.stringify({ teeth, filmType: img.filmType }),
      });
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy("upload");
    try {
      let last: XrayImage | null = null;
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("filmType", uploadType);
        if (selectedTooth) fd.append("teeth", String(selectedTooth));
        last = await api<XrayImage>(`/api/patients/${patientId}/images`, { method: "POST", body: fd });
      }
      onChanged();
      if (last) onOpen([last.sopInstanceUid]);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2 bg-viewer-panel p-2 text-ink-100">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-1 font-semibold text-sm">
          ฟิล์ม X-ray {selectedTooth && !showAll ? `· ซี่ ${selectedTooth} + ภาพรวม` : "ทั้งหมด"}
          <span className="ml-1 font-normal text-ink-400">({list.length})</span>
        </span>
        {selectedTooth && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className={`rounded-full px-2.5 py-1 ${showAll ? "bg-amber-400 text-ink-900" : "bg-viewer-raised hover:bg-viewer-hover"}`}
            title="แสดงฟิล์มทุกภาพ เพื่อเลือกผูกกับซี่ที่เลือก"
          >
            {showAll ? "✓ แสดงทุกภาพ" : "แสดงทุกภาพ"}
          </button>
        )}
        <span className="mx-0.5 h-4 w-px bg-viewer-hover" />
        {(["ALL", ...types] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-full px-2.5 py-1 ${type === t ? "bg-ink-100 text-ink-900" : "bg-viewer-raised hover:bg-viewer-hover"}`}
          >
            {t === "ALL" ? "ทุกประเภท" : FILM_LABEL[t]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            disabled={compare.length !== 2}
            onClick={() => onOpen(compare)}
            className="rounded-lg bg-navy-500 px-3 py-1.5 font-medium text-white disabled:bg-viewer-hover disabled:text-ink-400"
            title="เลือก 2 ภาพ (ติ๊กมุมขวาบนของภาพ) เพื่อเทียบก่อน-หลังการรักษา"
          >
            เทียบ 1x2 ({compare.length}/2)
          </button>
          {canUpload && (
            <>
              <select
                value={uploadType}
                onChange={(e) => setUploadType(e.target.value as FilmType)}
                className="rounded-lg bg-viewer-raised px-2 py-1.5"
                title="ประเภทฟิล์มที่จะอัปโหลด"
              >
                {(Object.keys(FILM_LABEL) as FilmType[]).map((t) => (
                  <option key={t} value={t}>
                    {FILM_LABEL[t]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy === "upload"}
                className="rounded-lg bg-ink-100 px-3 py-1.5 font-medium text-ink-900 disabled:opacity-50"
                title={selectedTooth ? `อัปโหลดและผูกกับซี่ ${selectedTooth}` : "อัปโหลดไฟล์ .dcm"}
              >
                {busy === "upload" ? "กำลังอัปโหลด…" : "+ อัปโหลด DICOM"}
              </button>
              <input ref={fileRef} type="file" accept=".dcm,application/dicom" multiple hidden onChange={(e) => upload(e.target.files)} />
            </>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-viewer-hover text-sm text-ink-400">
          {selectedTooth ? `ยังไม่มีฟิล์มที่ผูกกับซี่ ${selectedTooth}` : "ยังไม่มีฟิล์มของคนไข้รายนี้"}
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {list.map((img) => {
            const isOpen = openSops.includes(img.sopInstanceUid);
            const inCompare = compare.includes(img.sopInstanceUid);
            const linked = selectedTooth ? img.teeth.includes(selectedTooth) : false;
            return (
              <div
                key={img.sopInstanceUid}
                className={`relative w-32 shrink-0 overflow-hidden rounded-lg bg-black ring-2 ${
                  isOpen ? "ring-navy-500" : "ring-transparent"
                }`}
              >
                <button onClick={() => onOpen([img.sopInstanceUid])} className="block h-24 w-full" title="เปิดใน Viewer">
                  <Thumb patientId={patientId} sop={img.sopInstanceUid} />
                </button>
                <label className="absolute top-1 right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded bg-black/60" title="เลือกเพื่อเทียบ">
                  <input type="checkbox" checked={inCompare} onChange={() => toggleCompare(img.sopInstanceUid)} className="h-4 w-4 accent-navy-400" />
                </label>
                <div className="space-y-0.5 px-1.5 py-1 text-[11px] leading-tight">
                  <div className="flex justify-between">
                    <span className="font-semibold">{FILM_LABEL[img.filmType]}</span>
                    <span className="text-ink-400 tabular-nums">{fmtDate(img.studyDate)}</span>
                  </div>
                  <div className="truncate text-ink-400">{img.teeth.length ? `ซี่ ${img.teeth.join(", ")}` : "ไม่ระบุซี่"}</div>
                  {canLink && selectedTooth && img.filmType !== "PANO" && (
                    <button
                      onClick={() => toggleLink(img)}
                      disabled={busy === img.sopInstanceUid}
                      className={`mt-0.5 w-full rounded px-1 py-0.5 ${linked ? "bg-viewer-hover" : "bg-navy-600"}`}
                    >
                      {linked ? `เลิกผูกซี่ ${selectedTooth}` : `ผูกกับซี่ ${selectedTooth}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
