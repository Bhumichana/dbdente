"use client";

import { useState } from "react";
import { STATUS_STYLE, SURFACE_LABEL } from "@/lib/fdi";
import type { Surface, ToothRecord, ToothStatus } from "@/lib/types";
import { ToothGlyph } from "./ToothGlyph";

const BRUSHES: (ToothStatus | "clear")[] = ["planned", "completed", "existing", "clear"];
const WHOLE: { v: ToothRecord["whole"] | ""; l: string }[] = [
  { v: "", l: "—" },
  { v: "planned", l: "วางแผน" },
  { v: "completed", l: "ทำเสร็จ" },
  { v: "existing", l: "เดิม" },
  { v: "missing", l: "ไม่มีฟัน/ถอนแล้ว" },
];

export function ToothEditor({
  tooth,
  record,
  canEdit,
  onSave,
}: {
  tooth: number;
  record?: ToothRecord;
  canEdit: boolean;
  onSave: (r: ToothRecord) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ToothRecord>(() => record ?? { tooth, surfaces: {} });
  const [brush, setBrush] = useState<ToothStatus | "clear">("planned");
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(record ?? { tooth, surfaces: {} });

  function paint(s: Surface) {
    if (!canEdit) return;
    setDraft((d) => {
      const surfaces = { ...d.surfaces };
      if (brush === "clear" || surfaces[s] === brush) delete surfaces[s];
      else surfaces[s] = brush;
      return { ...d, surfaces };
    });
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-lg font-semibold">ซี่ {tooth}</h3>
        {!canEdit && <span className="text-xs text-ink-400">ดูอย่างเดียว</span>}
      </div>
      <div className="flex gap-4">
        <div className="shrink-0">
          <ToothGlyph tooth={tooth} record={draft} size={108} onSurface={canEdit ? paint : undefined} showLetters />
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          {canEdit && (
            <div className="flex flex-wrap gap-1">
              {BRUSHES.map((b) => (
                <button
                  key={b}
                  onClick={() => setBrush(b)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${
                    brush === b ? "border-navy-800 bg-navy-800 text-white" : "border-ink-200"
                  }`}
                >
                  {b !== "clear" && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_STYLE[b].fill }} />}
                  {b === "clear" ? "ลบสี" : STATUS_STYLE[b].label.split(" ")[0]}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-ink-500">
            {canEdit ? "แตะด้านของฟันเพื่อระบายสี: " : ""}
            {Object.entries(draft.surfaces)
              .map(([s, st]) => `${s} (${SURFACE_LABEL[s as Surface]}) = ${STATUS_STYLE[st!].label.split(" ")[0]}`)
              .join(", ") || "ยังไม่มีการบันทึกด้านฟัน"}
          </p>
          <label className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-ink-500">ทั้งซี่</span>
            <select
              disabled={!canEdit}
              value={draft.whole ?? ""}
              onChange={(e) => setDraft({ ...draft, whole: (e.target.value || undefined) as ToothRecord["whole"] })}
              className="min-w-0 flex-1 rounded-lg border border-ink-200 px-2 py-1.5"
            >
              {WHOLE.map((w) => (
                <option key={w.l} value={w.v}>
                  {w.l}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-ink-500">หัตถการ</span>
            <input
              disabled={!canEdit}
              value={draft.procedure ?? ""}
              onChange={(e) => setDraft({ ...draft, procedure: e.target.value })}
              placeholder="เช่น Composite MO, RCT, Crown"
              className="min-w-0 flex-1 rounded-lg border border-ink-200 px-2 py-1.5"
            />
          </label>
        </div>
      </div>
      <textarea
        disabled={!canEdit}
        value={draft.note ?? ""}
        onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        placeholder="บันทึกเพิ่มเติม"
        rows={2}
        className="mt-2 w-full rounded-lg border border-ink-200 px-2 py-1.5 text-sm"
      />
      {canEdit && (
        <div className="mt-2 flex justify-end gap-2">
          {dirty && (
            <button onClick={() => setDraft(record ?? { tooth, surfaces: {} })} className="rounded-lg px-3 py-1.5 text-sm text-ink-500">
              ยกเลิก
            </button>
          )}
          <button
            disabled={!dirty || saving}
            onClick={save}
            className="rounded-lg bg-navy-700 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      )}
    </div>
  );
}
