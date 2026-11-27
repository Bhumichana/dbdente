"use client";

import { useEffect, useState } from "react";
import { AppHeader, RequireSession } from "@/components/AppHeader";
import { api } from "@/lib/api";
import { useHydrated } from "@/lib/session";
import type { AuditEntry } from "@/lib/types";

const ACTION_LABEL: Record<string, string> = {
  LOGIN: "เข้าสู่ระบบ",
  VIEW_PATIENT: "เปิดประวัติคนไข้",
  VIEW_IMAGE: "เปิดดูฟิล์ม",
  UPLOAD_IMAGE: "อัปโหลดฟิล์ม",
  UPDATE_CHART: "แก้ไขผังฟัน",
  LINK_IMAGE: "ผูกฟิล์มกับซี่ฟัน",
};

export default function AuditPage() {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return (
    <RequireSession>
      <AuditList />
    </RequireSession>
  );
}

function AuditList() {
  const [list, setList] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<AuditEntry[]>("/api/audit").then(setList, (e: Error) => setError(e.message));
  }, []);
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
        <h1 className="mb-1 text-xl font-semibold">Audit Log</h1>
        <p className="mb-4 text-sm text-ink-500">
          บันทึกทุกครั้งที่มีการเปิดดู อัปโหลด หรือแก้ไขข้อมูลคนไข้และฟิล์ม (ตามข้อกำหนด PDPA ใน PRD)
        </p>
        {error && <p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
        <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-ink-500">
              <tr>
                <th className="px-4 py-2 font-medium">เวลา</th>
                <th className="px-4 py-2 font-medium">ผู้ใช้</th>
                <th className="px-4 py-2 font-medium">การกระทำ</th>
                <th className="px-4 py-2 font-medium">คนไข้</th>
                <th className="px-4 py-2 font-medium">รายการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list?.map((e, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 whitespace-nowrap tabular-nums">
                    {new Date(e.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "medium" })}
                  </td>
                  <td className="px-4 py-2">{e.userName}</td>
                  <td className="px-4 py-2">{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td className="px-4 py-2">{e.patientName ?? "–"}</td>
                  <td className="max-w-xs truncate px-4 py-2 font-mono text-xs text-ink-500" title={e.target}>
                    {e.target ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
