"use client";

import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { age } from "@/lib/age";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Patient } from "@/lib/types";

export type PickedPatient = Pick<Patient, "id" | "hn" | "fullName" | "allergies">;

/** เลือกคนไข้ด้วยการค้นชื่อ / HN / เบอร์โทร */
export function PatientPicker({
  id,
  value,
  onChange,
  invalid,
  disabled,
}: {
  id?: string;
  value: PickedPatient | null;
  onChange: (p: PickedPatient | null) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Patient[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (value || !q.trim()) return;
    const t = setTimeout(() => {
      api<Patient[]>(`/api/patients?q=${encodeURIComponent(q.trim())}`).then((l) => {
        setList(l.slice(0, 6));
        setIdx(0);
      });
    }, 150);
    return () => clearTimeout(t);
  }, [q, value]);

  if (value) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-lg border border-ink-300 bg-navy-50 px-3 text-sm">
        <span className="font-mono text-ink-500">{value.hn}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{value.fullName}</span>
        {value.allergies.length > 0 && <Badge tone="danger-solid">แพ้ยา</Badge>}
        {!disabled && (
          <button
            type="button"
            aria-label="เปลี่ยนคนไข้"
            onClick={() => {
              onChange(null);
              setQ("");
              setList([]);
            }}
            className="rounded p-1 text-ink-500 hover:bg-ink-100"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    );
  }

  const shown = q.trim() ? list : [];
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
      <input
        id={id}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (!shown.length || !["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) return;
          e.preventDefault();
          if (e.key === "ArrowDown") setIdx((i) => (i + 1) % shown.length);
          else if (e.key === "ArrowUp") setIdx((i) => (i - 1 + shown.length) % shown.length);
          else onChange(shown[idx]);
        }}
        placeholder="ค้นหาชื่อ, HN หรือเบอร์โทร"
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls={id ? `${id}-list` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        className={cn(
          "h-10 w-full rounded-lg border border-ink-300 bg-white pr-3 pl-9 text-sm placeholder:text-ink-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 focus:outline-none",
          invalid && "border-danger",
        )}
      />
      {shown.length > 0 && (
        <ul id={id ? `${id}-list` : undefined} role="listbox" className="absolute inset-x-0 top-11 z-10 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-lg">
          {shown.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === idx}
              onMouseEnter={() => setIdx(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(p)}
              className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 text-sm", i === idx && "bg-navy-50")}
            >
              <span className="w-20 font-mono text-ink-500">{p.hn}</span>
              <span className="min-w-0 flex-1 truncate">{p.fullName}</span>
              <span className="text-xs text-ink-500">{age(p.birthDate)} ปี</span>
              {p.allergies.length > 0 && <Badge tone="danger">แพ้ยา</Badge>}
            </li>
          ))}
        </ul>
      )}
      {q.trim() && list.length === 0 && <p className="mt-1 text-xs text-ink-500">ไม่พบคนไข้ — ลงทะเบียนก่อนที่เมนูคนไข้</p>}
    </div>
  );
}
