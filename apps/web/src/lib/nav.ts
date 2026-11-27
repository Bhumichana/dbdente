import {
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
        soon: {
          phase: "Phase 1",
          summary: "ออกบิลจากหัตถการที่ทำเสร็จในห้องตรวจ และรับชำระหลายช่องทางในบิลเดียว",
          features: [
            "ดึงรายการหัตถการสถานะ “ทำเสร็จแล้ว” มาเป็นรายการในบิลอัตโนมัติ",
            "แบ่งจ่าย เงินสด / โอน / บัตรเครดิต / ตัดมัดจำ",
            "ใบเสร็จ และปิดยอดประจำวัน",
            "ผ่อนชำระสำหรับจัดฟันและรากเทียม (Phase 2)",
          ],
        },
      },
      {
        href: "/df",
        label: "ค่ามือหมอ (DF)",
        icon: HandCoins,
        roles: ["owner", "dentist"],
        soon: {
          phase: "Phase 2",
          summary: "คำนวณค่ามือหมออัตโนมัติจากบิลที่ชำระแล้ว",
          features: [
            "กำหนด % แยกตามหมวดหัตถการ ต่อทันตแพทย์",
            "หักค่าแล็บ / วัสดุก่อนคิด %",
            "ประกันรายได้ขั้นต่ำรายวัน",
            "ทันตแพทย์เห็นสรุป DF ของตัวเองเท่านั้น",
          ],
        },
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
        soon: {
          phase: "Phase 3",
          summary: "ติดตามงานที่ส่งแล็บ ตั้งแต่ส่งออกจนรับกลับ",
          features: ["บันทึกงานส่งแล็บและวันนัดรับ", "เตือนงานใกล้ครบกำหนด", "ค่าแล็บผูกกับบิลและการคิด DF"],
        },
      },
      {
        href: "/stock",
        label: "สต็อกวัสดุ",
        icon: Package,
        roles: ["owner", "assistant"],
        soon: {
          phase: "Phase 3",
          summary: "รับเข้า ตัดเบิก และเตือนวัสดุใกล้หมด",
          features: ["รับเข้า / ตัดเบิกตามหัตถการ", "จุดสั่งซื้อขั้นต่ำ", "วันหมดอายุของวัสดุ"],
        },
      },
      {
        href: "/reports",
        label: "รายงาน",
        icon: ChartColumn,
        roles: ["owner", "dentist", "receptionist"],
        soon: {
          phase: "Phase 3",
          summary: "Dashboard รายได้และการดำเนินงานของคลินิก",
          features: [
            "รายได้ตามทันตแพทย์ / หัตถการ / สาขา",
            "คนไข้ใหม่ และอัตราการมาตามนัด",
            "เคาน์เตอร์เห็นเฉพาะรายงานปิดยอดวัน",
          ],
        },
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
        soon: {
          phase: "Phase 1",
          summary: "ข้อมูลคลินิก ผู้ใช้ และค่าพื้นฐานของระบบ",
          features: [
            "สาขา และเก้าอี้ทำฟัน",
            "ผู้ใช้และบทบาท",
            "รายการหัตถการและราคา",
            "เทมเพลตเอกสารยินยอม (E-Consent)",
          ],
        },
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
