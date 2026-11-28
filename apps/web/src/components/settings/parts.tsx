"use client";

import { Plus, Search } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";

export const isActive = (x: { active?: boolean }) => x.active !== false;

/** ป้าย "ปิดใช้งาน" ต่อท้ายชื่อ (รายการที่ใช้งานอยู่ไม่ต้องมีป้าย) */
export function ActiveBadge({ active }: { active: boolean }) {
  return active ? null : <Badge className="ml-2 align-middle">ปิดใช้งาน</Badge>;
}

/** แถบเครื่องมือเหนือตาราง: ค้นหา · แสดงรายการที่ปิดใช้งาน · ปุ่มเพิ่ม */
export function Toolbar({
  q,
  onQ,
  placeholder,
  showInactive,
  onShowInactive,
  inactiveCount,
  addLabel,
  onAdd,
  children,
}: {
  q?: string;
  onQ?: (q: string) => void;
  placeholder?: string;
  showInactive: boolean;
  onShowInactive: (v: boolean) => void;
  inactiveCount: number;
  addLabel: string;
  onAdd: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {onQ && (
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
          <Input value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder} className="pl-9" aria-label={placeholder} />
        </div>
      )}
      {children}
      {inactiveCount > 0 && (
        <label className="flex items-center gap-2 text-sm text-ink-600">
          <input type="checkbox" className="size-4 accent-teal-600" checked={showInactive} onChange={(e) => onShowInactive(e.target.checked)} />
          แสดงที่ปิดใช้งาน ({inactiveCount})
        </label>
      )}
      <span className="flex-1" />
      <Button onClick={onAdd}>
        <Plus />
        {addLabel}
      </Button>
    </div>
  );
}

/**
 * กล่องแก้ไข/เพิ่มรายการ — ส่งไป API แล้วแจ้งผล
 * ข้อผิดพลาดที่ API ระบุ field มา จะส่งกลับไปให้ช่องนั้นแสดง (fieldError) ที่เหลือแสดงเป็นแถบแดงด้านล่าง
 */
export function EditDialog<T>({
  open,
  onOpenChange,
  title,
  description,
  path,
  method,
  body,
  onSaved,
  savedMessage,
  wide,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: ReactNode;
  path: string;
  method: "POST" | "PUT";
  body: () => unknown;
  onSaved: (row: T) => void;
  savedMessage: string;
  wide?: boolean;
  children: (fieldError: (f: string) => string | null) => ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const fieldError = (f: string) => (error?.field === f ? error.message : null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const row = await api<T>(path, { method, body: JSON.stringify(body()) });
      onSaved(row);
      toast(savedMessage);
      onOpenChange(false);
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : "บันทึกไม่สำเร็จ",
        field: err instanceof ApiError && typeof err.body.field === "string" ? err.body.field : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setError(null);
        onOpenChange(v);
      }}
    >
      {open && (
        <DialogContent title={title} description={description} className={wide ? "max-w-2xl" : undefined}>
          <form className="grid min-h-0 gap-4 overflow-y-auto p-5" onSubmit={submit} noValidate>
            {children(fieldError)}
            {error && !error.field && <Alert>{error.message}</Alert>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "กำลังบันทึก…" : "บันทึก"}
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}

/** สวิตช์ใช้งาน/ปิดใช้งานในฟอร์มแก้ไข พร้อมคำอธิบายผลกระทบ */
export function ActiveToggle({ checked, onChange, hint }: { checked: boolean; onChange: (v: boolean) => void; hint: string }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-ink-200 px-3 py-2.5">
      <input type="checkbox" className="mt-1 size-4 accent-teal-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm">
        <span className="block font-medium text-ink-800">ใช้งานอยู่</span>
        <span className="text-ink-500">{hint}</span>
      </span>
    </label>
  );
}

/** แทนที่แถวที่แก้ หรือเพิ่มแถวใหม่ต่อท้าย */
export const upsert = <T extends { id: string }>(list: T[], row: T) =>
  list.some((x) => x.id === row.id) ? list.map((x) => (x.id === row.id ? row : x)) : [...list, row];
