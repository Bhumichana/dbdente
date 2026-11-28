"use client";

import { PERMANENT, PRIMARY, STATUS_STYLE } from "@/lib/fdi";
import type { ToothRecord } from "@/lib/types";
import { ToothGlyph } from "./ToothGlyph";

export type Dentition = "permanent" | "primary" | "mixed";

interface Props {
  records: Record<number, ToothRecord>;
  filmCount: Record<number, number>;
  selected: number | null;
  onSelect: (tooth: number | null) => void;
  dentition: Dentition;
  onDentition: (d: Dentition) => void;
}

export function ToothChart({ records, filmCount, selected, onSelect, dentition, onDentition }: Props) {
  const showPermanent = dentition !== "primary";
  const showPrimary = dentition !== "permanent";

  const row = (teeth: number[], upper: boolean, cols: number) => (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {teeth.map((t, i) => {
        const rec = records[t];
        const isSel = selected === t;
        const films = filmCount[t] ?? 0;
        const midline = i === teeth.length / 2;
        const whole = rec?.whole && rec.whole !== "missing" ? STATUS_STYLE[rec.whole] : null;
        const label = (
          <span
            className={`rounded px-1 py-px text-[11px] tabular-nums leading-none ${
              films > 0 ? "bg-navy-600 font-semibold text-white" : isSel ? "font-bold text-navy-700" : "text-ink-500"
            }`}
          >
            {t}
          </span>
        );
        return (
          <button
            key={t}
            onClick={() => onSelect(isSel ? null : t)}
            className={`relative flex flex-col items-center gap-1 rounded-md px-[2px] py-1 transition ${
              isSel ? "bg-teal-50 ring-2 ring-teal-500" : "hover:bg-ink-100"
            } ${midline ? "before:absolute before:top-1 before:bottom-1 before:-left-[2px] before:w-px before:bg-ink-400" : ""}`}
            data-tooth={t}
            title={[`ซี่ ${t}`, rec?.procedure, films ? `ฟิล์ม ${films} ภาพ` : ""].filter(Boolean).join(" · ")}
          >
            {upper && label}
            <div className="w-full max-w-[38px]">
              <ToothGlyph tooth={t} record={rec} fluid />
            </div>
            <span
              className="h-[3px] w-4/5 rounded-full"
              style={{ background: whole ? whole.fill : "transparent" }}
              title={whole?.label}
            />
            {!upper && label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">ผังฟัน (FDI)</h2>
        <div className="ml-auto flex rounded-lg bg-ink-100 p-0.5 text-xs">
          {(
            [
              ["permanent", "ฟันแท้"],
              ["mixed", "ผสม"],
              ["primary", "ฟันน้ำนม"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => onDentition(k)}
              className={`rounded-md px-2.5 py-1 ${dentition === k ? "bg-white font-medium shadow-sm" : "text-ink-500"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1 rounded-xl border border-ink-200 bg-white p-2">
        {showPermanent && row(PERMANENT.upper, true, 16)}
        {showPrimary && (
          <div className={showPermanent ? "px-[15.6%]" : ""}>{row(PRIMARY.upper, true, 10)}</div>
        )}
        <div className="flex items-center gap-2 py-0.5 text-[10px] text-ink-400">
          <span>ขวาคนไข้</span>
          <span className="h-px flex-1 bg-ink-200" />
          <span>ซ้ายคนไข้</span>
        </div>
        {showPrimary && (
          <div className={showPermanent ? "px-[15.6%]" : ""}>{row(PRIMARY.lower, false, 10)}</div>
        )}
        {showPermanent && row(PERMANENT.lower, false, 16)}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-600">
        {Object.entries(STATUS_STYLE).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: v.fill }} />
            {v.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="rounded bg-navy-600 px-1 text-[10px] font-semibold text-white">36</span>
          มีฟิล์ม X-ray
        </span>
      </div>
    </div>
  );
}
