"use client";

import { useSession } from "./session";

/** ค่าเริ่มต้นใช้ hostname เดียวกับหน้าเว็บ เพื่อให้เปิดจาก iPad ในวง LAN ได้ทันที */
export function apiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
  if (typeof window === "undefined") return "http://localhost:4000";
  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** เนื้อหา error จาก API เช่น { field, existingId } */
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useSession.getState().token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(`${apiBase()}${path}`, { ...init, headers });
  // token หมดอายุ → ล้าง session แล้ว RequireSession จะพากลับหน้าแรกเอง
  if (res.status === 401) useSession.getState().logout();
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? res.statusText, body);
  }
  return res.json() as Promise<T>;
}

/** ดึงไฟล์ภาพแบบมี Authorization แล้วคืนเป็น object URL (ใช้กับ <img>) */
export async function fetchBlobUrl(path: string) {
  const token = useSession.getState().token;
  const res = await fetch(`${apiBase()}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return URL.createObjectURL(await res.blob());
}

export const imageFileUrl = (patientId: string, sop: string) =>
  `${apiBase()}/api/patients/${patientId}/images/${sop}/file`;
