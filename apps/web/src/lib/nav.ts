import {
  Cable,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  FlaskConical,
  HandCoins,
  ListOrdered,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "./types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** บทบาทที่เห็นเมนูนี้ (ตาม RBAC ใน PRD ข้อ 2) */
  roles: Role[];
  /** ยังไม่สร้าง — แสดงหน้า "อยู่ในแผน" พร้อมเฟส */
  soon?: { phase: string; summary: string; features: string[] };
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const ALL: Role[] = ["owner", "dentist", "receptionist", "assistant"];

export const NAV: NavGroup[] = [
  {
    label: "งานประจำวัน",
    items: [
      {
        href: "/queue",
        label: "คิววันนี้",
        icon: ListOrdered,
        roles: ALL,
      },
      {
        href: "/appointments",
        label: "นัดหมาย",
        icon: CalendarDays,
        roles: ALL,
      },
      { href: "/patients", label: "คนไข้", icon: Users, roles: ALL },
    ],
  },
  {
    label: "การเงิน",
    items: [
      {
        href: "/billing",
        label: "รับชำระเงิน",
        icon: Receipt,
        roles: ["owner", "receptionist"],
      },
      {
        href: "/installments",
        label: "ผ่อนชำระ / มัดจำ",
        icon: CalendarClock,
        roles: ["owner", "receptionist"],
      },
      {
        href: "/df",
        label: "ค่ามือหมอ (DF)",
        icon: HandCoins,
        roles: ["owner", "dentist"],
      },
    ],
  },
  {
    label: "คลินิก",
    items: [
      {
        href: "/lab",
        label: "งานแล็บ",
        icon: FlaskConical,
        roles: ["owner", "dentist", "receptionist"],
      },
      {
        href: "/stock",
        label: "สต็อกวัสดุ",
        icon: Package,
        roles: ["owner", "assistant"],
      },
      {
        href: "/bridge",
        label: "Local Bridge",
        icon: Cable,
        roles: ["owner", "assistant"],
      },
      {
        href: "/reports",
        label: "รายงาน",
        icon: ChartColumn,
        roles: ["owner", "dentist", "receptionist"],
      },
    ],
  },
  {
    label: "ระบบ",
    items: [
      {
        href: "/settings",
        label: "ตั้งค่าคลินิก",
        icon: Settings,
        roles: ["owner"],
      },
      { href: "/audit", label: "Audit Log", icon: ShieldCheck, roles: ["owner"] },
    ],
  },
];

export const NAV_ITEMS = NAV.flatMap((g) => g.items);

/** เมนูที่ตรงกับ path ปัจจุบัน (รวมหน้าย่อย เช่น /patients/p1) */
export function navItemFor(pathname: string) {
  return NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
}

export function navFor(role: Role | undefined): NavGroup[] {
  if (!role) return [];
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter((g) => g.items.length);
}

/** หน้าแรกหลัง login ตามบทบาท: เจ้าของ = Dashboard · คนอื่น = คิววันนี้ */
export const homeFor = (role: Role | undefined) => (role === "owner" ? "/reports" : "/queue");
