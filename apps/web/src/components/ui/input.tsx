import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const FIELD =
  "w-full rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 transition-colors " +
  "focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-100 disabled:bg-ink-50 disabled:text-ink-500 " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger-soft";

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD, "h-10", className)} {...p} />;
}

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD, "min-h-20 py-2 leading-relaxed", className)} {...p} />;
}

export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(FIELD, "h-10 pr-8", className)} {...p} />;
}

/**
 * ป้ายกำกับ + ช่องกรอก + คำอธิบาย/ข้อผิดพลาด
 * children เป็นฟังก์ชันรับ props (id, aria-*) ไปใส่ให้ช่องกรอก
 */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: (p: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink-700">
        {label}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": hint || error ? msgId : undefined })}
      {error ? (
        <p id={msgId} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
