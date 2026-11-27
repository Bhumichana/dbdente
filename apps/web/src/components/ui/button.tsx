import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const VARIANT = {
  primary: "bg-navy-700 text-white hover:bg-navy-800 active:bg-navy-900 disabled:bg-ink-300 disabled:text-white",
  secondary:
    "border border-navy-200 bg-white text-navy-700 hover:bg-navy-50 active:bg-navy-100 disabled:border-ink-200 disabled:text-ink-400",
  ghost: "text-navy-700 hover:bg-navy-50 active:bg-navy-100 disabled:text-ink-400",
  danger: "bg-danger text-white hover:bg-red-800 disabled:opacity-50",
} as const;

/** md = 40px สำหรับ PC, lg = 48px สำหรับ iPad/จอสัมผัส */
const SIZE = {
  sm: "h-8 gap-1.5 px-3 text-sm",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-5 text-base",
  icon: "size-10",
} as const;

export type ButtonVariant = keyof typeof VARIANT;
export type ButtonSize = keyof typeof SIZE;

/** ใช้กับ <Link> ที่ต้องหน้าตาเหมือนปุ่ม */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}
