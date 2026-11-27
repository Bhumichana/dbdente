"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import type { Chair, Dentist } from "./types";

/** ทันตแพทย์ + เก้าอี้ของคลินิก (ใช้ในปฏิทิน/คิว/ฟอร์มนัด) */
export function useClinicRefs() {
  const [dentists, setDentists] = useState<Dentist[]>([]);
  const [chairs, setChairs] = useState<Chair[]>([]);
  useEffect(() => {
    api<Dentist[]>("/api/staff/dentists").then(setDentists);
    api<Chair[]>("/api/chairs").then(setChairs);
  }, []);
  return { dentists, chairs, setChairs, reloadChairs: () => api<Chair[]>("/api/chairs").then(setChairs) };
}

/** สีประจำทันตแพทย์ในปฏิทิน (ตามลำดับ) — แยกจากสีสถานะ */
const PALETTE = [
  { block: "bg-navy-100 border-navy-700 text-navy-900", dot: "bg-navy-700" },
  { block: "bg-[#e2f1f3] border-[#1b7d86] text-[#0f4d53]", dot: "bg-[#1b7d86]" },
  { block: "bg-[#f1ebfa] border-[#6b4bb8] text-[#3e2a75]", dot: "bg-[#6b4bb8]" },
  { block: "bg-[#fdf1e3] border-[#b86a12] text-[#6b3d08]", dot: "bg-[#b86a12]" },
  { block: "bg-[#fbe9ef] border-[#b03a62] text-[#6e1f3a]", dot: "bg-[#b03a62]" },
];
export const dentistColor = (dentists: Dentist[], id: string) => PALETTE[Math.max(0, dentists.findIndex((d) => d.id === id)) % PALETTE.length];

/** วันที่ (YYYY-MM-DD) ± n วัน */
export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const minutesOf = (start: string) => Number(start.slice(11, 13)) * 60 + Number(start.slice(14, 16));
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** นาทีที่ผ่านไปตั้งแต่เวลา ISO */
export const minutesSince = (iso: string | undefined, now: number) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 60000)) : 0);

/** เวลาปัจจุบันแบบไทย YYYY-MM-DDTHH:mm */
export const nowLocal = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }).slice(0, 16).replace(" ", "T");
