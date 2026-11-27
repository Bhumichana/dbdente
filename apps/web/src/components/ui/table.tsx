import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** ตารางในกรอบการ์ด เลื่อนแนวนอนเองเมื่อจอแคบ */
export function Table({ className, ...p }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
      <table className={cn("w-full text-sm", className)} {...p} />
    </div>
  );
}

export function THead({ className, ...p }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-navy-50 text-left text-xs text-ink-500", className)} {...p} />;
}

export function TBody({ className, ...p }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-ink-100", className)} {...p} />;
}

export function TH({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("whitespace-nowrap px-4 py-2.5 font-medium", className)} {...p} />;
}

/** num = ตัวเลข (เงิน, จำนวน) ชิดขวา ฟอนต์เท่ากันทุกหลัก */
export function TD({ className, num, ...p }: TdHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return <td className={cn("px-4 py-2.5", num && "text-right font-mono", className)} {...p} />;
}
