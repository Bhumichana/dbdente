"use client";

import { ChevronLeft, ChevronRight, Plus, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { addDays, dentistColor, hhmm, minutesOf, nowLocal, useClinicRefs } from "@/lib/clinic";
import { cn } from "@/lib/cn";
import { thaiDate } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { useRole, useSession } from "@/lib/session";
import { APPT_STATUS, type Appointment } from "@/lib/types";
import { AppointmentDialog, DAY_END, DAY_START, type AppointmentDraft } from "./AppointmentDialog";

const PX = 1.6; // px ต่อนาที (30 นาที = 48px)
const SNAP = 15;
const HIDDEN = ["cancelled", "no_show"];

type View = "chair" | "dentist";
interface Col {
  key: string;
  title: string;
  sub?: string;
  off?: boolean;
}
interface Drag {
  id: string;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  moved: boolean;
}

export function AppointmentCalendar() {
  const role = useRole();
  const me = useSession((s) => s.user?.id);
  const canEdit = role === "owner" || role === "receptionist";
  const { dentists, chairs } = useClinicRefs();

  const [date, setDate] = useState(() => nowLocal().slice(0, 10));
  const [view, setView] = useState<View>(role === "dentist" ? "dentist" : "chair");
  const [showHidden, setShowHidden] = useState(false);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [dialog, setDialog] = useState<{ appointment?: Appointment; draft?: AppointmentDraft } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [now, setNow] = useState(nowLocal);
  const scroller = useRef<HTMLDivElement>(null);

  const load = useCallback(() => api<Appointment[]>(`/api/appointments?date=${date}`).then(setAppts), [date]);
  useEffect(() => {
    load();
  }, [load]);
  const live = useRealtime(load);

  useEffect(() => {
    const t = setInterval(() => setNow(nowLocal()), 30_000);
    return () => clearInterval(t);
  }, []);

  // เปิดมาเลื่อนไปที่เวลาปัจจุบัน (หรือ 08:00)
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const n = nowLocal();
    const min = date === n.slice(0, 10) ? minutesOf(n) - 60 : DAY_START;
    el.scrollTop = Math.max(0, (min - DAY_START) * PX);
  }, [date]);

  const cols: Col[] =
    view === "chair"
      ? [
          ...chairs.map((c) => ({ key: c.id, title: c.name, sub: c.status === "maintenance" ? "ปิดซ่อม" : undefined, off: c.status === "maintenance" })),
          ...(appts.some((a) => !a.chairId && !HIDDEN.includes(a.status)) ? [{ key: "", title: "ยังไม่ระบุเก้าอี้" }] : []),
        ]
      : dentists.map((d) => ({ key: d.id, title: d.name, sub: d.id === me ? "ตารางของฉัน" : undefined }));
  const colOf = (a: Appointment) => (view === "chair" ? (a.chairId ?? "") : a.dentistId);
  const visible = appts.filter((a) => showHidden || !HIDDEN.includes(a.status));
  const isToday = date === now.slice(0, 10);
  const nowMin = minutesOf(now);

  function openDraft(colKey: string, e: React.MouseEvent<HTMLDivElement>) {
    if (!canEdit || e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const min = Math.min(DAY_END - SNAP, DAY_START + Math.floor(y / PX / SNAP) * SNAP);
    setDialog({
      draft: { date, time: hhmm(min), ...(view === "chair" ? { chairId: colKey || undefined } : { dentistId: colKey }) },
    });
  }

  // ----- ลากย้ายนัด (เฉพาะสถานะ "นัดไว้") -----
  const draggable = (a: Appointment) => canEdit && a.status === "booked";
  function onDown(e: RPointerEvent<HTMLButtonElement>, a: Appointment) {
    if (!draggable(a)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: a.id, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false });
  }
  function onMove(e: RPointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    setDrag({ ...drag, dx, dy, moved: drag.moved || Math.abs(dx) > 5 || Math.abs(dy) > 5 });
  }
  async function onUp(e: RPointerEvent<HTMLButtonElement>, a: Appointment) {
    const d = drag;
    setDrag(null);
    if (!d || !d.moved) return setDialog({ appointment: a });
    const target = document
      .elementsFromPoint(e.clientX, e.clientY)
      .map((el) => (el as HTMLElement).dataset?.col)
      .find((k) => k !== undefined);
    const col = target ?? colOf(a);
    const min = Math.max(DAY_START, Math.min(DAY_END - a.durationMin, minutesOf(a.start) + Math.round(d.dy / PX / SNAP) * SNAP));
    const start = `${date}T${hhmm(min)}`;
    if (start === a.start && col === colOf(a)) return;
    try {
      await api(`/api/appointments/${a.id}`, {
        method: "PUT",
        body: JSON.stringify({ start, ...(view === "chair" ? { chairId: col } : { dentistId: col }) }),
      });
      toast(`ย้ายนัด ${a.patient?.fullName} → ${hhmm(min)} น.`);
    } catch (err) {
      toast((err as Error).message, "error");
    }
    load();
  }

  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START + i * 60);
  const count = appts.filter((a) => !HIDDEN.includes(a.status)).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 bg-white px-3 py-2 sm:px-4">
        <div className="flex items-center">
          <Button variant="ghost" size="icon" aria-label="วันก่อนหน้า" onClick={() => setDate(addDays(date, -1))}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon" aria-label="วันถัดไป" onClick={() => setDate(addDays(date, 1))}>
            <ChevronRight />
          </Button>
        </div>
        <h1 className="font-semibold text-ink-900">{thaiDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h1>
        <input type="date" aria-label="เลือกวันที่" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9 rounded-lg border border-ink-200 px-2 text-sm" />
        {!isToday && (
          <Button variant="secondary" size="sm" onClick={() => setDate(now.slice(0, 10))}>
            วันนี้
          </Button>
        )}
        <span className="text-sm text-ink-500">
          <span className="font-mono">{count}</span> นัด
        </span>
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-sm text-ink-600">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="size-4 accent-navy-700" />
          แสดงที่ยกเลิก
        </label>
        <div role="radiogroup" aria-label="มุมมอง" className="flex overflow-hidden rounded-lg border border-ink-200">
          {(
            [
              ["chair", "ตามเก้าอี้"],
              ["dentist", "ตามหมอ"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={cn("h-9 px-3 text-sm", view === v ? "bg-navy-700 font-medium text-white" : "bg-white text-ink-600 hover:bg-navy-50")}
            >
              {l}
            </button>
          ))}
        </div>
        {canEdit && (
          <Button onClick={() => setDialog({ draft: { date, time: isToday ? hhmm(Math.min(DAY_END - 30, Math.ceil(nowMin / 15) * 15)) : "09:00" } })}>
            <Plus />
            นัดใหม่
          </Button>
        )}
        <span title={live ? "อัปเดตอัตโนมัติ" : "กำลังเชื่อมต่อ…"} className={cn("size-2.5 rounded-full", live ? "bg-teal-500" : "bg-ink-300")} />
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-auto bg-white">
        <div className="relative grid min-w-max" style={{ gridTemplateColumns: `56px repeat(${cols.length}, minmax(168px, 1fr))` }}>
          {/* หัวคอลัมน์ */}
          <div className="sticky top-0 left-0 z-30 h-[52px] border-r border-b border-ink-200 bg-white" />
          {cols.map((c) => (
            <div key={c.key} className="sticky top-0 z-20 h-[52px] border-b border-l border-ink-200 bg-white px-3 py-2">
              <div className="flex items-center gap-2 truncate text-sm font-semibold text-ink-900">
                {view === "dentist" && <span className={cn("size-2.5 shrink-0 rounded-full", dentistColor(dentists, c.key).dot)} />}
                {c.title}
              </div>
              <div className="h-4 text-xs text-ink-500">{c.sub}</div>
            </div>
          ))}

          {/* แกนเวลา */}
          <div className="sticky left-0 z-10 border-r border-ink-200 bg-white" style={{ height: (DAY_END - DAY_START) * PX }}>
            {hours.map((h) => (
              <div key={h} className="relative font-mono text-[11px] text-ink-500" style={{ height: 60 * PX }}>
                <span className="absolute -top-2 right-2 bg-white px-0.5">{h > DAY_START ? hhmm(h) : ""}</span>
              </div>
            ))}
          </div>

          {cols.map((c) => (
            <div
              key={c.key}
              data-col={c.key}
              onClick={(e) => openDraft(c.key, e)}
              className={cn("relative border-l border-ink-200", canEdit && "cursor-cell", c.off && "bg-[repeating-linear-gradient(45deg,#eef1f6,#eef1f6_6px,#f7f9fc_6px,#f7f9fc_12px)]")}
              style={{
                height: (DAY_END - DAY_START) * PX,
                backgroundImage: c.off
                  ? undefined
                  : `repeating-linear-gradient(to bottom, var(--color-ink-200) 0 1px, transparent 1px ${60 * PX}px), repeating-linear-gradient(to bottom, var(--color-ink-100) 0 1px, transparent 1px ${30 * PX}px)`,
              }}
            >
              {visible
                .filter((a) => colOf(a) === c.key)
                .map((a) => {
                  const top = (minutesOf(a.start) - DAY_START) * PX;
                  const height = Math.max(a.durationMin * PX - 2, 22);
                  const dragging = drag?.id === a.id && drag.moved;
                  const color = dentistColor(dentists, a.dentistId);
                  const hidden = HIDDEN.includes(a.status);
                  const alert = (a.patient?.allergies.length ?? 0) > 0;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onPointerDown={(e) => onDown(e, a)}
                      onPointerMove={onMove}
                      onPointerUp={(e) => onUp(e, a)}
                      onPointerCancel={() => setDrag(null)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.key === "Enter" && setDialog({ appointment: a })}
                      className={cn(
                        "absolute right-1 left-1 overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left text-xs leading-snug shadow-sm transition-shadow",
                        color.block,
                        draggable(a) ? "cursor-grab touch-none" : "cursor-pointer",
                        a.status === "done" && "opacity-60",
                        hidden && "opacity-50 line-through",
                        a.status === "in_room" && "ring-2 ring-teal-500",
                        dragging && "z-20 cursor-grabbing opacity-90 shadow-lg",
                      )}
                      style={{ top, height, transform: dragging ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined }}
                      title={`${a.start.slice(11)}–${a.end.slice(11)} ${a.patient?.fullName} · ${a.procedure}`}
                    >
                      <span className="flex items-center gap-1">
                        <span className="font-mono">{dragging ? hhmm(Math.max(DAY_START, minutesOf(a.start) + Math.round(drag.dy / PX / SNAP) * SNAP)) : a.start.slice(11)}</span>
                        <span className="truncate font-semibold">{a.patient?.fullName}</span>
                        {alert && <TriangleAlert className="size-3 shrink-0 text-danger" aria-label="แพ้ยา" />}
                      </span>
                      {height > 34 && <span className="block truncate">{a.procedure}</span>}
                      {height > 52 && (
                        <span className="mt-0.5 flex items-center gap-1">
                          {a.status !== "booked" && (
                            <Badge tone={APPT_STATUS[a.status].tone} className="px-1.5 py-0 text-[10px]">
                              {APPT_STATUS[a.status].label}
                            </Badge>
                          )}
                          <span className="truncate opacity-75">{view === "chair" ? a.dentistName : a.chairName}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          ))}

          {/* เส้นเวลาปัจจุบัน */}
          {isToday && nowMin >= DAY_START && nowMin < DAY_END && (
            <div
              aria-hidden
              className="pointer-events-none absolute right-0 left-14 z-[15] border-t-2 border-danger"
              style={{ top: 52 + (nowMin - DAY_START) * PX }}
            >
              <span className="absolute -top-1.5 -left-1.5 size-2.5 rounded-full bg-danger" />
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog && (
          <AppointmentDialog
            key={dialog.appointment?.id ?? "new"}
            appointment={dialog.appointment}
            draft={dialog.draft}
            dentists={dentists}
            chairs={chairs}
            canEdit={canEdit}
            onDone={() => {
              setDialog(null);
              load();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
