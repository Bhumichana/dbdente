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
    <header className="flex h-14 shrink-0 items-center gap-4 bg-navy-950 px-4 text-navy-100">
      <Link href="/patients" className="flex items-center gap-2 font-semibold text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-600 text-white ring-1 ring-navy-500">D</span>
        <span className="hidden sm:inline">DBDente</span>
      </Link>
      <nav className="flex items-center gap-1 text-sm">
        <Link href="/patients" className="rounded-lg px-3 py-1.5 hover:bg-navy-800 hover:text-white">
          คนไข้
        </Link>
        {user?.role === "owner" && (
          <Link href="/audit" className="rounded-lg px-3 py-1.5 hover:bg-navy-800 hover:text-white">
            Audit Log
          </Link>
        )}
      </nav>
      <div className="flex-1">{children}</div>
      {user && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-right leading-tight">
            <span className="block font-medium text-white">{user.name}</span>
            <span className="block text-xs text-navy-200">{ROLE_LABEL[user.role]}</span>
          </span>
          <button
            onClick={() => {
              logout();
              router.push("/");
            }}
            className="rounded-lg border border-navy-700 px-3 py-1.5 hover:bg-navy-800"
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
