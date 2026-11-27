"use client";

import { Search, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { age } from "@/lib/age";
import { api } from "@/lib/api";
import type { Patient } from "@/lib/types";

export default function PatientsPage() {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Patient[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api<Patient[]>(`/api/patients?q=${encodeURIComponent(q)}`).then(setList);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">ทะเบียนคนไข้</h1>
        {list && <span className="font-mono text-sm text-ink-500">{list.length} ราย</span>}
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ หรือ HN" aria-label="ค้นหาคนไข้" className="pl-9" />
        </div>
        <Button disabled title="ลงทะเบียนคนไข้ใหม่ — Phase 1">
          <UserPlus />
          ลงทะเบียนใหม่
        </Button>
      </div>

      {list?.length === 0 ? (
        <EmptyState icon={<Users />} title="ไม่พบคนไข้">
          ไม่มีคนไข้ที่ตรงกับ “{q}” ลองค้นด้วย HN หรือชื่อบางส่วน
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-ink-100">
            {!list &&
              [0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-4 px-4 py-3.5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-48" />
                </li>
              ))}
            {list?.map((p) => (
              <li key={p.id}>
                <Link href={`/patients/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-navy-50">
                  <span className="w-24 font-mono text-sm text-ink-500">{p.hn}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{p.fullName}</span>
                    <span className="ml-2 text-sm text-ink-500">
                      {p.sex === "M" ? "ชาย" : "หญิง"} · {age(p.birthDate)} ปี
                    </span>
                  </span>
                  {p.allergies.length > 0 && <Badge tone="danger">แพ้ยา {p.allergies.length}</Badge>}
                  {p.medicalAlerts.length > 0 && <Badge tone="warning">โรคประจำตัว/ข้อควรระวัง</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
