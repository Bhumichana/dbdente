"use client";

import { Eraser } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * ช่องเซ็นชื่อด้วยนิ้ว/ปากกา (Pointer Events — ใช้ได้ทั้ง iPad, Android, เมาส์)
 * onChange(dataUrl) เมื่อเซ็นเสร็จแต่ละเส้น · onChange(null) เมื่อล้าง
 */
export function SignaturePad({ onChange, className }: { onChange: (png: string | null) => void; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });

  // ขนาดจริงตาม devicePixelRatio ให้เส้นคม (ปรับเมื่อหมุนจอ — เส้นเดิมถูกล้าง)
  useEffect(() => {
    const c = canvas.current!;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      const ctx = c.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0f1e36";
      ctx.lineWidth = 2.4;
      cb.current(null);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function clear() {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    onChange(null);
  }

  return (
    <div className={cn("relative", className)}>
      <canvas
        ref={canvas}
        aria-label="ช่องเซ็นชื่อ ใช้นิ้วหรือปากกาเซ็น"
        role="img"
        className="h-full w-full touch-none rounded-2xl border-2 border-dashed border-navy-200 bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          last.current = pos(e);
          const ctx = canvas.current!.getContext("2d")!;
          ctx.beginPath();
          ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = "#0f1e36";
          ctx.fill();
        }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return;
          const p = pos(e);
          const ctx = canvas.current!.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          last.current = p;
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          last.current = null;
          onChange(canvas.current!.toDataURL("image/png"));
        }}
        onPointerCancel={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
      <span className="pointer-events-none absolute bottom-3 left-4 text-sm text-ink-300 select-none">เซ็นชื่อในกรอบนี้</span>
      <button
        type="button"
        onClick={clear}
        className="absolute top-2 right-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-navy-700 hover:bg-navy-50"
      >
        <Eraser className="size-4" />
        ล้าง
      </button>
    </div>
  );
}
