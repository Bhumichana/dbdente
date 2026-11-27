"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { imageFileUrl } from "@/lib/api";
import { FILM_LABEL, type XrayImage } from "@/lib/types";
import { core, initCornerstone, tools } from "./cornerstone";

type Point3 = [number, number, number];
type StackViewport = InstanceType<typeof core.StackViewport>;

const { MouseBindings } = tools.Enums;

export type PrimaryTool = "WindowLevel" | "Pan" | "Zoom" | "Length" | "Angle" | "ArrowAnnotate";

const TOOLBAR: { tool: PrimaryTool; label: string; icon: string }[] = [
  { tool: "WindowLevel", label: "แสง/คอนทราสต์", icon: "◐" },
  { tool: "Zoom", label: "ซูม", icon: "⌕" },
  { tool: "Pan", label: "เลื่อน", icon: "✥" },
  { tool: "Length", label: "วัดระยะ (mm)", icon: "📏" },
  { tool: "Angle", label: "วัดมุม", icon: "∠" },
  { tool: "ArrowAnnotate", label: "ปักหมุดข้อความ", icon: "➚" },
];

type ActionKey = "invert" | "rotate" | "flip" | "sharpen" | "reset" | "clear";

const ACTIONS: { key: ActionKey; label: string; icon: string }[] = [
  { key: "invert", label: "กลับสีขาว-ดำ (Invert)", icon: "◑" },
  { key: "rotate", label: "หมุน 90°", icon: "↻" },
  { key: "flip", label: "กลับด้านซ้าย-ขวา", icon: "⇋" },
  { key: "sharpen", label: "เพิ่มความคมชัด (Sharpen)", icon: "◇" },
  { key: "reset", label: "รีเซ็ตภาพ", icon: "⟲" },
  { key: "clear", label: "ลบการวัดทั้งหมด", icon: "⌫" },
];

interface SlotInfo {
  loadMs?: number;
  ww?: number;
  wl?: number;
  error?: string;
}

const fmtDate = (d: string) => (d.length === 8 ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : d);

export default function DicomViewer({ patientId, images }: { patientId: string; images: XrayImage[] }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const engineId = `re-${uid}`;
  const toolGroupId = `tg-${uid}`;
  const vpId = (i: number) => `vp-${uid}-${i}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const elRefs = useRef<(HTMLDivElement | null)[]>([]);
  const engineRef = useRef<InstanceType<typeof core.RenderingEngine> | null>(null);
  const [ready, setReady] = useState(false);
  const [primary, setPrimary] = useState<PrimaryTool>("WindowLevel");
  const [active, setActive] = useState(0);
  const [info, setInfo] = useState<SlotInfo[]>([]);
  const [sharpen, setSharpen] = useState<boolean[]>([]);

  // ---------- init engine + tool group ----------
  useEffect(() => {
    let disposed = false;
    initCornerstone().then(() => {
      if (disposed) return;
      engineRef.current = new core.RenderingEngine(engineId);
      const tg = tools.ToolGroupManager.createToolGroup(toolGroupId)!;
      for (const t of TOOLBAR) tg.addTool(tools[`${t.tool}Tool` as const].toolName);
      setReady(true);
    });
    return () => {
      disposed = true;
      tools.ToolGroupManager.destroyToolGroup(toolGroupId);
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [engineId, toolGroupId]);

  // ---------- tool bindings ----------
  useEffect(() => {
    if (!ready) return;
    const tg = tools.ToolGroupManager.getToolGroup(toolGroupId);
    if (!tg) return;
    for (const { tool } of TOOLBAR) {
      const name = tools[`${tool}Tool` as const].toolName;
      const bindings: { mouseButton?: number; numTouchPoints?: number }[] = [];
      if (tool === primary) bindings.push({ mouseButton: MouseBindings.Primary });
      if (tool === "Pan") bindings.push({ mouseButton: MouseBindings.Auxiliary }, { numTouchPoints: 3 });
      if (tool === "Zoom")
        bindings.push({ mouseButton: MouseBindings.Secondary }, { mouseButton: MouseBindings.Wheel }, { numTouchPoints: 2 });
      if (bindings.length) tg.setToolActive(name, { bindings });
      else if (tool === "WindowLevel") tg.setToolDisabled(name);
      else tg.setToolPassive(name); // ยังแก้ไขการวัดเดิมได้
    }
  }, [ready, primary, toolGroupId]);

  // ---------- load images ----------
  useEffect(() => {
    const engine = engineRef.current;
    if (!ready || !engine) return;
    const tg = tools.ToolGroupManager.getToolGroup(toolGroupId)!;
    const inputs = images.map((_, i) => ({
      viewportId: vpId(i),
      type: core.Enums.ViewportType.STACK,
      element: elRefs.current[i]!,
      defaultOptions: { background: [0, 0, 0] as Point3 },
    }));
    for (const id of tg.getViewportIds()) tg.removeViewports(engineId, id);
    engine.setViewports(inputs);
    setInfo(images.map(() => ({})));
    setSharpen(images.map(() => false));
    setActive(0);

    images.forEach((img, i) => {
      const vp = engine.getViewport(vpId(i)) as StackViewport;
      tg.addViewport(vpId(i), engineId);
      const t0 = performance.now();
      vp.setStack([`wadouri:${imageFileUrl(patientId, img.sopInstanceUid)}`])
        .then(() => {
          vp.render();
          const loadMs = Math.round(performance.now() - t0);
          setInfo((s) => s.map((x, j) => (j === i ? { ...x, loadMs, ...voiOf(vp) } : x)));
        })
        .catch((e: unknown) => {
          setInfo((s) => s.map((x, j) => (j === i ? { ...x, error: String((e as Error)?.message ?? e) } : x)));
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, images, patientId]);

  // ---------- VOI overlay + resize ----------
  useEffect(() => {
    if (!ready) return;
    const els = elRefs.current.slice(0, images.length);
    const handlers = els.map((el, i) => {
      const h = () => {
        const vp = engineRef.current?.getViewport(vpId(i)) as StackViewport | undefined;
        if (vp) setInfo((s) => s.map((x, j) => (j === i ? { ...x, ...voiOf(vp) } : x)));
      };
      el?.addEventListener(core.Enums.Events.VOI_MODIFIED, h);
      return h;
    });
    const ro = new ResizeObserver(() => engineRef.current?.resize(true, false));
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      els.forEach((el, i) => el?.removeEventListener(core.Enums.Events.VOI_MODIFIED, handlers[i]));
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, images]);

  const withActive = useCallback(
    (fn: (vp: StackViewport, i: number) => void) => {
      const vp = engineRef.current?.getViewport(vpId(active)) as StackViewport | undefined;
      if (!vp) return;
      fn(vp, active);
      vp.render();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active],
  );

  function runAction(key: ActionKey) {
    if (key === "clear") {
      tools.annotation.state.removeAllAnnotations();
      engineRef.current?.render();
      return;
    }
    withActive((vp, i) => {
      if (key === "invert") vp.setProperties({ invert: !vp.getProperties().invert });
      if (key === "rotate") {
        const p = vp.getViewPresentation();
        vp.setViewPresentation({ rotation: ((p.rotation ?? 0) + 90) % 360 });
      }
      if (key === "flip") vp.setCamera({ flipHorizontal: !vp.getCamera().flipHorizontal });
      if (key === "sharpen") {
        const on = !sharpen[i];
        vp.setProperties({ sharpening: on ? 0.6 : 0 });
        setSharpen((s) => s.map((x, j) => (j === i ? on : x)));
      }
      if (key === "reset") {
        vp.resetCamera();
        vp.resetProperties();
        setSharpen((s) => s.map((x, j) => (j === i ? false : x)));
        setInfo((s) => s.map((x, j) => (j === i ? { ...x, ...voiOf(vp) } : x)));
      }
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-viewer text-ink-100">
      <div className="flex flex-wrap items-center gap-1 border-b border-viewer-line p-1.5">
        {TOOLBAR.map((t) => (
          <button
            key={t.tool}
            onClick={() => setPrimary(t.tool)}
            title={t.label}
            aria-pressed={primary === t.tool}
            className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm ${
              primary === t.tool ? "bg-navy-600 text-white" : "hover:bg-viewer-raised"
            }`}
          >
            <span className="text-base leading-none">{t.icon}</span>
            <span className="hidden 2xl:inline">{t.label}</span>
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-viewer-hover" />
        {ACTIONS.map((a) => {
          const pressed = a.key === "sharpen" && sharpen[active];
          return (
          <button
            key={a.key}
            onClick={() => runAction(a.key)}
            title={a.label}
            aria-pressed={pressed}
            className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-base ${
              pressed ? "bg-viewer-hover" : "hover:bg-viewer-raised"
            }`}
          >
            {a.icon}
          </button>
          );
        })}
      </div>

      <div ref={containerRef} className={`grid min-h-0 flex-1 gap-1 p-1 ${images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {images.map((img, i) => (
          <div
            key={img.sopInstanceUid + i}
            onPointerDown={() => setActive(i)}
            className={`relative min-h-0 overflow-hidden rounded ${
              images.length > 1 && active === i ? "ring-2 ring-navy-500" : "ring-1 ring-viewer-line"
            }`}
          >
            <div
              ref={(el) => {
                elRefs.current[i] = el;
              }}
              onContextMenu={(e) => e.preventDefault()}
              className="cs-viewport absolute inset-0"
            />
            <div className="pointer-events-none absolute top-2 left-2 text-xs leading-relaxed text-ink-200 drop-shadow">
              <div className="font-semibold">
                {FILM_LABEL[img.filmType]} {img.teeth.length > 0 && `· ซี่ ${img.teeth.join(", ")}`}
              </div>
              <div>{fmtDate(img.studyDate)}</div>
              <div className="text-ink-400">{img.seriesDescription}</div>
            </div>
            <div className="pointer-events-none absolute right-2 bottom-2 text-right text-[11px] text-ink-300 tabular-nums drop-shadow">
              {info[i]?.ww !== undefined && (
                <div>
                  WW {info[i].ww} / WL {info[i].wl}
                </div>
              )}
              {info[i]?.loadMs !== undefined && (
                <div className={info[i].loadMs! <= 1500 ? "text-emerald-400" : "text-amber-400"}>
                  โหลด {info[i].loadMs} ms
                </div>
              )}
            </div>
            {info[i]?.error && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-red-300">
                เปิดภาพไม่สำเร็จ: {info[i].error}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function voiOf(vp: StackViewport) {
  const r = vp.getProperties().voiRange;
  if (!r) return {};
  return { ww: Math.round(r.upper - r.lower), wl: Math.round((r.upper + r.lower) / 2) };
}
