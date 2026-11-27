"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/types";

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const { user, logout } = useSession();
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4">
      <Link href="/patients" className="flex items-center gap-2 font-semibold">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">D</span>
        <span className="hidden sm:inline">DBDente</span>
      </Link>
      <nav className="flex items-center gap-1 text-sm">
        <Link href="/patients" className="rounded-lg px-3 py-1.5 hover:bg-slate-100">
          คนไข้
        </Link>
        {user?.role === "owner" && (
          <Link href="/audit" className="rounded-lg px-3 py-1.5 hover:bg-slate-100">
            Audit Log
          </Link>
        )}
      </nav>
      <div className="flex-1">{children}</div>
      {user && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-right leading-tight">
            <span className="block font-medium">{user.name}</span>
            <span className="block text-xs text-slate-500">{ROLE_LABEL[user.role]}</span>
          </span>
          <button
            onClick={() => {
              logout();
              router.push("/");
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50"
          >
            ออก
          </button>
        </div>
      )}
    </header>
  );
}

/** ใช้ครอบหน้าที่ต้อง login */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const token = useSession((s) => s.token);
  const router = useRouter();
  useEffect(() => {
    if (!token) router.replace("/");
  }, [token, router]);
  return token ? <>{children}</> : null;
}
