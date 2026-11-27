import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** รวม className แบบ Tailwind (class หลังทับ class ก่อนหน้าที่ขัดกัน) */
export const cn = (...v: ClassValue[]) => twMerge(clsx(v));
