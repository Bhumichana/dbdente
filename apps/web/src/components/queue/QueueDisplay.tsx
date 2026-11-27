"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useRealtime, type QueueCall } from "@/lib/realtime";
import { useSession } from "@/lib/session";

interface DisplayItem {
  queueNo: string;
  status: "arrived" | "in_room";
  chairName?: string;
  maskedName: string;
  calledAt?: string;
}

/** ตีระฆัง 2 โน้ต + อ่านออกเสียง (ถ้าเครื่องมีเสียงภาษาไทย) */
function announce(ctx: AudioContext | null, c: QueueCall) {
  if (ctx) {
    [880, 660].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g).connect(ctx.destination);
      const t = ctx.currentTime + i * 0.45;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      o.start(t);
      o.stop(t + 0.85);
    });
  }
  if ("speechSynthesis" in window) {
    const say = `ขอเชิญหมายเลข ${c.queueNo.split("").join(" ")} ที่ ${c.chairName.replace("Unit", "ยูนิต")}`;
    const u = new SpeechSynthesisUtterance(say);
    u.lang = "th-TH";
    u.rate = 0.9;
    setTimeout(() => speechSynthesis.speak(u), 1000);
  }
}

/** จอเรียกคิว (ทีวีหน้าห้องตรวจ) — แสดงเลขคิว ห้อง และชื่อแบบปิดบังเท่านั้น */
export function QueueDisplay() {
  const router = useRouter();
  const token = useSession((s) => s.token);
  const clinicName = useSession((s) => s.user?.clinicName);
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!token) router.replace("/");
  }, [token, router]);

  const load = useCallback(() => api<DisplayItem[]>("/api/queue/display").then(setItems), []);
  useEffect(() => {
    load();
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, [load]);

  const live = useRealtime(load, (c) => {
    setFlash(c.queueNo);
    setTimeout(() => setFlash((f) => (f === c.queueNo ? null : f)), 8000);
    if (sound) announce(audio.current, c);
    load();
  });

  const inRoom = items.filter((i) => i.status === "in_room").sort((a, b) => (b.calledAt ?? "").localeCompare(a.calledAt ?? ""));
  const waiting = items.filter((i) => i.status === "arrived");
  const current = inRoom.find((i) => i.queueNo === flash) ?? inRoom[0];

  return (
    <div className="flex h-dvh flex-col bg-navy-950 text-white select-none">
      <header className="flex items-center gap-4 bg-navy-900 px-8 py-4">
        <span className="flex size-11 items-center justify-center rounded-xl bg-navy-700 text-xl font-bold ring-1 ring-navy-500">D</span>
        <span className="text-2xl font-semibold">{clinicName}</span>
        <span className="flex-1" />
        <span className={cn("size-3 rounded-full", live ? "bg-success" : "bg-ink-500")} title={live ? "เชื่อมต่อแล้ว" : "กำลังเชื่อมต่อ"} />
        <span className="font-mono text-3xl tabular-nums">{clock.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</span>
      </header>

      <main className="grid min-h-0 flex-1 gap-6 p-8 lg:grid-cols-[2fr_1fr]">
        <section className="flex min-h-0 flex-col gap-6">
          <div
            className={cn(
              "flex flex-1 flex-col items-center justify-center rounded-3xl bg-navy-800 p-8 text-center transition-colors",
              flash && current?.queueNo === flash && "anim-pop bg-navy-600",
            )}
          >
            {current ? (
              <>
                <p className="text-3xl text-navy-200">ขอเชิญหมายเลข</p>
                <p className="my-2 font-mono text-[min(18vw,11rem)] leading-none font-medium tracking-wider">{current.queueNo}</p>
                <p className="text-4xl font-semibold">ที่ {current.chairName}</p>
                <p className="mt-4 text-2xl text-navy-200">{current.maskedName}</p>
              </>
            ) : (
              <p className="text-3xl text-navy-200">ยังไม่มีการเรียกคิว</p>
            )}
          </div>
          {inRoom.length > 1 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {inRoom
                .filter((i) => i !== current)
                .slice(0, 4)
                .map((i) => (
                  <div key={i.queueNo} className="rounded-2xl bg-navy-900 px-5 py-4">
                    <p className="font-mono text-4xl">{i.queueNo}</p>
                    <p className="text-xl text-navy-200">{i.chairName}</p>
                  </div>
                ))}
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-col rounded-3xl bg-navy-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold text-navy-200">
            คิวที่รอ <span className="font-mono">{waiting.length}</span>
          </h2>
          <ol className="grid min-h-0 gap-3 overflow-hidden">
            {waiting.slice(0, 8).map((i) => (
              <li key={i.queueNo} className="flex items-baseline gap-4 border-b border-navy-800 pb-3">
                <span className="font-mono text-4xl">{i.queueNo}</span>
                <span className="truncate text-xl text-navy-200">{i.maskedName}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <button
        onClick={() => {
          if (!sound) {
            audio.current ??= new AudioContext();
            void audio.current.resume();
          }
          setSound(!sound);
        }}
        className="fixed right-6 bottom-6 flex items-center gap-2 rounded-full bg-navy-800/80 px-4 py-2 text-sm text-navy-100 hover:bg-navy-700"
      >
        {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        {sound ? "เสียงเรียกคิว: เปิด" : "แตะเพื่อเปิดเสียงเรียกคิว"}
      </button>
    </div>
  );
}
