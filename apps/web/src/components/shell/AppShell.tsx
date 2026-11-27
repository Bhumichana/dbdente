"use client";

import { LogOut, Menu, Search, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Toaster } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { navFor, navItemFor } from "@/lib/nav";
import { useHydrated, useSession } from "@/lib/session";
import { ROLE_LABEL, type User } from "@/lib/types";
import { PatientSearch } from "./PatientSearch";

/** หน้าที่ต้องการพื้นที่ทำงานเต็มที่ (ห้องตรวจ) — เมนูย่อเป็นแถบไอคอนเสมอ */
const isWorkspace = (path: string) => /^\/patients\/[^/]+/.test(path);

const SlotContext = createContext<HTMLElement | null>(null);

/** วางเนื้อหาลงแถบบนของ shell (เช่น ชื่อ/HN คนไข้ในห้องตรวจ) */
export function TopbarSlot({ children }: { children: ReactNode }) {
  const slot = useContext(SlotContext);
  return slot ? createPortal(children, slot) : null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const { token, user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (hydrated && !token) router.replace("/");
  }, [hydrated, token, router]);

  // Ctrl/⌘ + K = ค้นหาคนไข้ จากทุกหน้า
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ก่อน hydrate (รวมตอน render บน server) ยังไม่รู้ว่าใคร login → วาดโครงและหน้าไว้ก่อน เมนูตามบทบาทเติมทีหลัง
  // หลัง hydrate ถ้าไม่มี session จะไม่แสดงเนื้อหา และ effect ด้านบนพาไปหน้า login
  const signedOut = hydrated && (!token || !user);
  const me = hydrated ? user : null; // server กับ render แรกของ browser ต้องตรงกัน (กัน hydration mismatch)
  const item = navItemFor(pathname);
  const allowed = !me || !item || item.roles.includes(me.role);
  const compact = isWorkspace(pathname);

  return (
    <SlotContext.Provider value={slot}>
      <div className="flex h-dvh">
        <aside
          className={cn(
            "hidden shrink-0 flex-col bg-navy-950 text-navy-200 md:flex",
            compact ? "w-16" : "w-16 xl:w-60",
          )}
        >
          <SidebarBody user={me} mode={compact ? "rail" : "auto"} pathname={pathname} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-200 bg-white px-3 sm:px-4">
            <button
              aria-label="เปิดเมนู"
              onClick={() => setMenuOpen(true)}
              className="-ml-1 rounded-lg p-2 text-ink-600 hover:bg-ink-100 md:hidden"
            >
              <Menu className="size-5" />
            </button>
            <span className={cn("shrink-0 font-semibold text-ink-900", compact && "hidden lg:inline")}>
              {item?.label ?? "DBDente"}
            </span>
            <div ref={setSlot} className="flex min-w-0 flex-1 items-center gap-3 empty:hidden" />
            <span className="flex-1" />
            <button
              onClick={() => setSearchOpen(true)}
              className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-ink-200 bg-navy-50 px-3 text-sm text-ink-500 hover:border-navy-200 sm:w-64"
            >
              <Search className="size-4" />
              <span className="hidden flex-1 text-left sm:inline">ค้นหาคนไข้ ชื่อ / HN</span>
              <kbd className="hidden rounded border border-ink-200 bg-white px-1.5 font-mono text-[10px] lg:inline">
                Ctrl K
              </kbd>
            </button>
          </header>

          <main className="relative min-h-0 flex-1 overflow-y-auto">
            {signedOut ? null : allowed ? (
              children
            ) : (
              <div className="p-4 sm:p-6">
                <EmptyState icon={<ShieldAlert />} title="ไม่มีสิทธิ์เข้าถึงหน้านี้">
                  บทบาท{me && ROLE_LABEL[me.role]}ไม่ได้รับสิทธิ์ใช้เมนู “{item?.label}” หากต้องใช้งาน ติดต่อเจ้าของคลินิก
                </EmptyState>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* เมนูบนจอแคบ (มือถือ / iPad แนวตั้งแบบแบ่งจอ) */}
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent title="เมนู" side="left" hideHeader className="bg-navy-950 text-navy-200">
          <SidebarBody user={me} mode="full" pathname={pathname} onNavigate={() => setMenuOpen(false)} />
        </DialogContent>
      </Dialog>

      <PatientSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <Toaster />
    </SlotContext.Provider>
  );
}

function initials(name: string) {
  const word = name.split(/\s+/).find((w) => w && !w.endsWith(".")) ?? name;
  return word.slice(0, 2);
}

/**
 * mode: rail = ไอคอนอย่างเดียว · auto = ไอคอนบนจอ < 1280px, เต็มบน xl · full = เต็มเสมอ (ในแผงมือถือ)
 */
function SidebarBody({
  user,
  mode,
  pathname,
  onNavigate,
}: {
  user: User | null;
  mode: "rail" | "auto" | "full";
  pathname: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const logout = useSession((s) => s.logout);
  const groups = navFor(user?.role);
  // ข้อความที่ซ่อนในโหมดไอคอน แต่ screen reader ยังอ่านได้
  const text = mode === "full" ? "" : mode === "rail" ? "sr-only" : "sr-only xl:not-sr-only";
  const showWhenWide = mode === "full" ? "" : mode === "rail" ? "hidden" : "hidden xl:block";
  const center = mode === "full" ? "" : mode === "rail" ? "justify-center" : "justify-center xl:justify-start";

  return (
    <div className="flex h-full flex-col pb-[env(safe-area-inset-bottom)]">
      <Link
        href="/patients"
        onClick={onNavigate}
        className={cn("flex h-14 shrink-0 items-center gap-2.5 px-3.5", center)}
        title={user?.clinicName}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy-700 font-bold text-white ring-1 ring-navy-500">
          D
        </span>
        <span className={cn("min-w-0 leading-tight", text)}>
          <span className="block font-semibold text-white">DBDente</span>
          <span className="block truncate text-xs text-navy-200">{user?.clinicName}</span>
        </span>
      </Link>

      <nav aria-label="เมนูหลัก" className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
        {groups.map((g) => (
          <div key={g.label}>
            <p className={cn("px-2.5 pb-1 text-[11px] font-medium tracking-wider text-navy-300/80", showWhenWide)}>
              {g.label}
            </p>
            {mode !== "full" && <hr className={cn("mx-2 mb-2 border-navy-800", mode === "auto" && "xl:hidden")} />}
            <ul className="space-y-0.5">
              {g.items.map((i) => {
                const active = pathname === i.href || pathname.startsWith(`${i.href}/`);
                const Icon = i.icon;
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={onNavigate}
                      title={i.label}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-11 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors",
                        center,
                        active ? "bg-navy-800 font-medium text-white" : "hover:bg-navy-900 hover:text-white",
                      )}
                    >
                      <Icon className={cn("size-5 shrink-0", active ? "text-navy-300" : "opacity-80")} />
                      <span className={cn("flex-1 truncate", text)}>{i.label}</span>
                      {i.soon && (
                        <span className={cn("rounded-full border border-navy-700 px-1.5 text-[10px] text-navy-300", showWhenWide)}>
                          {i.soon.phase.replace("Phase ", "P")}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {user && (
      <div className={cn("flex shrink-0 items-center gap-2.5 border-t border-navy-800 p-3", mode !== "full" && "flex-col", mode === "auto" && "xl:flex-row")}>
        <span
          title={`${user.name} · ${ROLE_LABEL[user.role]}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-white"
        >
          {initials(user.name)}
        </span>
        <span className={cn("min-w-0 flex-1 leading-tight", text)}>
          <span className="block truncate text-sm font-medium text-white">{user.name}</span>
          <span className="block text-xs text-navy-300">{ROLE_LABEL[user.role]}</span>
        </span>
        <button
          aria-label="ออกจากระบบ"
          title="ออกจากระบบ"
          onClick={() => {
            logout();
            router.push("/");
          }}
          className="rounded-lg p-2 text-navy-200 hover:bg-navy-900 hover:text-white"
        >
          <LogOut className="size-5" />
        </button>
      </div>
      )}
    </div>
  );
}
