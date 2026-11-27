"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader, RequireSession } from "@/components/AppHeader";
import { api } from "@/lib/api";
import { useHydrated } from "@/lib/session";
import type { Patient } from "@/lib/types";

export default function PatientsPage() {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return (
    <RequireSession>
      <PatientList />
    </RequireSession>
  );
}

function age(birth: string) {
  const b = new Date(birth);
  const n = new Date();
  return n.getFullYear() - b.getFullYear() - (n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
}

function PatientList() {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Patient[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api<Patient[]>(`/api/patients?q=${encodeURIComponent(q)}`).then(setList);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl p-4 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-xl font-semibold">คนไข้</h1>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ หรือ HN"
            className="ml-auto w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {list?.length === 0 && <p className="p-6 text-center text-slate-400">ไม่พบคนไข้</p>}
          <ul className="divide-y divide-slate-100">
            {list?.map((p) => (
              <li key={p.id}>
                <Link href={`/patients/${p.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50">
                  <span className="w-24 font-mono text-sm text-slate-500">{p.hn}</span>
                  <span className="flex-1">
                    <span className="font-medium">{p.fullName}</span>
                    <span className="ml-2 text-sm text-slate-500">
                      {p.sex === "M" ? "ชาย" : "หญิง"} · {age(p.birthDate)} ปี
                    </span>
                  </span>
                  {p.allergies.length > 0 && (
                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                      แพ้ยา {p.allergies.length}
                    </span>
                  )}
                  {p.medicalAlerts.length > 0 && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                      โรคประจำตัว/ข้อควรระวัง
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}
