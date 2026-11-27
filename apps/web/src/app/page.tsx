"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useHydrated, useSession } from "@/lib/session";
import { ROLE_LABEL, type User } from "@/lib/types";

const ROLE_HINT: Record<User["role"], string> = {
  owner: "เห็นทุกอย่าง รวมถึง Audit Log",
  dentist: "ผังฟัน บันทึกการรักษา และ DICOM Viewer",
  receptionist: "ทะเบียนคนไข้ (ไม่เห็นข้อมูลการรักษาและฟิล์ม)",
  assistant: "อัปโหลดและผูกฟิล์ม X-ray กับซี่ฟัน",
};

export default function DemoLogin() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { token, setSession } = useSession();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && token) router.replace("/patients");
  }, [hydrated, token, router]);

  useEffect(() => {
    api<User[]>("/api/auth/demo-users")
      .then(setUsers)
      .catch(() => setError("เชื่อมต่อ API ไม่ได้ — ตรวจสอบว่ารัน apps/api แล้ว (npm run dev)"));
  }, []);

  async function login(u: User) {
    const r = await api<{ token: string; user: User }>("/api/auth/demo-login", {
      method: "POST",
      body: JSON.stringify({ userId: u.id }),
    });
    setSession(r.token, { ...r.user, clinicName: u.clinicName });
    router.push("/patients");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-navy-700 text-xl font-bold text-white">
            D
          </div>
          <h1 className="text-2xl font-semibold">DBDente</h1>
          <p className="text-ink-500">ระบบคลินิกทันตกรรม + Web DICOM Viewer — เดโมระยะ 0</p>
        </div>

        <div className="rounded-2xl border border-ink-200 bg-white p-2 shadow-sm">
          <p className="px-4 pt-3 pb-2 text-sm text-ink-500">เลือกผู้ใช้เพื่อเข้าสู่ระบบ (ทดลองสิทธิ์ตามบทบาท)</p>
          {error && <p className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {!users && !error && <p className="p-4 text-ink-400">กำลังโหลด…</p>}
          <ul>
            {users?.map((u) => (
              <li key={u.id}>
                <button
                  onClick={() => login(u)}
                  className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left hover:bg-navy-50 active:bg-navy-100"
                >
                  <span>
                    <span className="block font-medium">{u.name}</span>
                    <span className="block text-sm text-ink-500">{ROLE_HINT[u.role]}</span>
                  </span>
                  <span className="rounded-full bg-ink-100 px-3 py-1 text-xs text-ink-600">
                    {ROLE_LABEL[u.role]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {users?.[0]?.clinicName && <p className="mt-4 text-center text-sm text-ink-400">{users[0].clinicName}</p>}
      </div>
    </main>
  );
}
