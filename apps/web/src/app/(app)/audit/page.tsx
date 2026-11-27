"use client";

import { useEffect, useState } from "react";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { api } from "@/lib/api";
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
  const [list, setList] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<AuditEntry[]>("/api/audit").then(setList, (e: Error) => setError(e.message));
  }, []);
  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <h1 className="mb-1 text-xl font-semibold">Audit Log</h1>
      <p className="mb-4 text-sm text-ink-500">
        บันทึกทุกครั้งที่มีการเปิดดู อัปโหลด หรือแก้ไขข้อมูลคนไข้และฟิล์ม (ตามข้อกำหนด PDPA ใน PRD)
      </p>
      {error && <Alert className="mb-4">{error}</Alert>}
      <Table>
        <THead>
          <tr>
            <TH>เวลา</TH>
            <TH>ผู้ใช้</TH>
            <TH>การกระทำ</TH>
            <TH>คนไข้</TH>
            <TH>รายการ</TH>
          </tr>
        </THead>
        <TBody>
          {!list &&
            !error &&
            [0, 1, 2, 3].map((i) => (
              <tr key={i}>
                <TD colSpan={5}>
                  <Skeleton className="h-4 w-full" />
                </TD>
              </tr>
            ))}
          {list?.map((e, i) => (
            <tr key={i}>
              <TD className="whitespace-nowrap font-mono text-xs">
                {new Date(e.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "medium" })}
              </TD>
              <TD>{e.userName}</TD>
              <TD>{ACTION_LABEL[e.action] ?? e.action}</TD>
              <TD>{e.patientName ?? "–"}</TD>
              <TD className="max-w-xs truncate font-mono text-xs text-ink-500" title={e.target}>
                {e.target ?? ""}
              </TD>
            </tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
