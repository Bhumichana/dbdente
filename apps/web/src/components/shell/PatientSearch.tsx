"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { age } from "@/lib/age";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Patient } from "@/lib/types";

/** ค้นหาคนไข้ด่วน (Ctrl/⌘ K) ด้วยชื่อ หรือ HN แล้วเปิดแฟ้มคนไข้ */
export function PatientSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="ค้นหาคนไข้" hideHeader className="overflow-hidden p-0">
        {/* mount ใหม่ทุกครั้งที่เปิด → ช่องค้นหาว่างเสมอ */}
        <SearchBody onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function SearchBody({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [list, setList] = useState<Patient[] | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      api<Patient[]>(`/api/patients?q=${encodeURIComponent(q.trim())}`).then((l) => {
        setList(l.slice(0, 8));
        setIdx(0);
      });
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  function go(p: Patient | undefined) {
    if (!p) return;
    onDone();
    router.push(`/patients/${p.id}`);
  }

  return (
    <div
      onKeyDown={(e) => {
        if (!list?.length) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setIdx((i) => (i + 1) % list.length);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setIdx((i) => (i - 1 + list.length) % list.length);
        } else if (e.key === "Enter") {
          e.preventDefault();
          go(list[idx]);
        }
      }}
    >
      <div className="flex items-center gap-3 border-b border-ink-200 px-4">
        <Search className="size-5 shrink-0 text-ink-400" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="พิมพ์ชื่อ หรือ HN"
          aria-label="ค้นหาคนไข้"
          role="combobox"
          aria-expanded
          aria-controls="patient-search-results"
          aria-activedescendant={list?.[idx] ? `ps-${list[idx].id}` : undefined}
          className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-ink-400 focus-visible:outline-none"
        />
        <kbd className="hidden rounded border border-ink-200 px-1.5 font-mono text-[10px] text-ink-500 sm:inline">Esc</kbd>
      </div>

      <ul id="patient-search-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
        {list?.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-500">ไม่พบคนไข้ที่ตรงกับ “{q}”</li>}
        {list?.map((p, i) => (
          <li
            key={p.id}
            id={`ps-${p.id}`}
            role="option"
            aria-selected={i === idx}
            onMouseEnter={() => setIdx(i)}
            onClick={() => go(p)}
            className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5", i === idx && "bg-navy-50")}
          >
            <span className="w-20 shrink-0 font-mono text-sm text-ink-500">{p.hn}</span>
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{p.fullName}</span>
              <span className="ml-2 text-sm text-ink-500">
                {p.sex === "M" ? "ชาย" : "หญิง"} · {age(p.birthDate)} ปี
              </span>
            </span>
            {p.allergies.length > 0 && <Badge tone="danger">แพ้ยา</Badge>}
          </li>
        ))}
      </ul>
      <p className="border-t border-ink-100 px-4 py-2 text-xs text-ink-500">↑ ↓ เลือก · Enter เปิดแฟ้มคนไข้</p>
    </div>
  );
}
