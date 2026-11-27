"use client";

import { Search } from "lucide-react";
import { useId, useState, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { baht, parseBaht, toInput } from "@/lib/money";
import type { ProcedureItem } from "@/lib/types";

type Base = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">;

/**
 * ช่องกรอกจำนวนเงิน (บาท) — ส่งค่าออกเป็นสตางค์
 * พิมพ์ได้อิสระ (เช่น "1,200.5") ค่าที่ผิดรูปแบบไม่ถูกส่งออก และกรอบเป็นสีแดง
 */
export function MoneyInput({
  value,
  onValue,
  blankZero,
  className,
  ...p
}: Base & { value: number; onValue: (satang: number) => void; blankZero?: boolean }) {
  const show = (v: number) => (blankZero && v === 0 ? "" : toInput(v));
  const [text, setText] = useState(() => show(value));
  const [prev, setPrev] = useState(value);
  // ค่าถูกเปลี่ยนจากภายนอก (เช่น ปุ่ม "เต็มจำนวน") → อัปเดตข้อความตาม
  if (value !== prev) {
    setPrev(value);
    if ((parseBaht(text) ?? 0) !== value) setText(show(value));
  }
  const invalid = text !== "" && parseBaht(text) === null;
  return (
    <Input
      inputMode="decimal"
      autoComplete="off"
      {...p}
      value={text}
      aria-invalid={invalid || p["aria-invalid"] || undefined}
      className={cn("text-right font-mono", className)}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseBaht(e.target.value);
        if (v !== null || e.target.value === "") onValue(v ?? 0);
      }}
      onBlur={() => !invalid && setText(show(parseBaht(text) ?? 0))}
    />
  );
}

/** เลขซี่ "46, 47" ↔ [46, 47] */
export function TeethInput({ value, onValue, className, ...p }: Base & { value: number[]; onValue: (t: number[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  return (
    <Input
      inputMode="numeric"
      placeholder="—"
      {...p}
      value={text}
      className={cn("font-mono", className)}
      onChange={(e) => {
        setText(e.target.value);
        onValue([...new Set((e.target.value.match(/\d{2}/g) ?? []).map(Number))]);
      }}
    />
  );
}

/** ค้นหัตถการจากรายการราคาของคลินิก (ชื่อ / รหัส / หมวด) */
export function ProcedurePicker({ procedures, onPick }: { procedures: ProcedureItem[]; onPick: (p: ProcedureItem) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const t = q.trim().toLowerCase();
  const found = procedures.filter((p) => !t || `${p.name} ${p.code} ${p.category}`.toLowerCase().includes(t)).slice(0, 8);

  function pick(p: ProcedureItem) {
    onPick(p);
    setQ("");
    setOpen(false);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
      <Input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="เพิ่มหัตถการ"
        placeholder="เพิ่มหัตถการ: พิมพ์ชื่อหรือรหัส เช่น อุด, SCALE"
        className="pl-9"
        value={q}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, found.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && found[active]) {
            e.preventDefault();
            pick(found[active]);
          } else if (e.key === "Escape") setOpen(false);
          else return;
          e.preventDefault();
        }}
      />
      {open && found.length > 0 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-ink-200 bg-white p-1 shadow-lg">
          {found.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm", i === active && "bg-navy-50")}
            >
              <span className="w-14 shrink-0 font-mono text-xs text-ink-500">{p.code}</span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="font-mono text-ink-700">{baht(p.price)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
