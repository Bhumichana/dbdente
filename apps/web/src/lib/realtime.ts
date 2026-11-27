"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { apiBase } from "./api";
import { useSession } from "./session";

/**
 * การเชื่อมต่อ real-time เดียวต่อแท็บ (Socket.io) ใช้ JWT ของผู้ใช้
 * server ส่งแค่สัญญาณ "มีการเปลี่ยนแปลง" แล้วหน้าจอดึงข้อมูลใหม่ผ่าน API ตามสิทธิ์ของตัวเอง
 */
let socket: Socket | null = null;
let socketToken: string | null = null;

function getSocket(token: string) {
  if (socket && socketToken === token) return socket;
  socket?.close();
  socketToken = token;
  socket = io(apiBase(), { auth: { token }, transports: ["websocket"] });
  return socket;
}

export interface QueueCall {
  queueNo: string;
  chairName: string;
  maskedName: string;
}

/** เรียก onChange ทุกครั้งที่คิว/นัด/เก้าอี้เปลี่ยน · คืนสถานะการเชื่อมต่อ */
export function useRealtime(onChange: () => void, onCall?: (c: QueueCall) => void) {
  const token = useSession((s) => s.token);
  const [connected, setConnected] = useState(false);
  const handlers = useRef({ onChange, onCall });
  useEffect(() => {
    handlers.current = { onChange, onCall };
  });

  useEffect(() => {
    if (!token) return;
    const s = getSocket(token);
    const changed = () => handlers.current.onChange();
    const called = (c: QueueCall) => handlers.current.onCall?.(c);
    const up = () => {
      setConnected(true);
      handlers.current.onChange(); // ต่อกลับมาแล้วดึงข้อมูลใหม่ เผื่อพลาด event ระหว่างหลุด
    };
    const down = () => setConnected(false);
    s.on("queue:changed", changed);
    s.on("queue:call", called);
    s.on("connect", up);
    s.on("disconnect", down);
    s.on("connect_error", down);
    if (s.connected) setTimeout(() => setConnected(true), 0);
    return () => {
      s.off("queue:changed", changed);
      s.off("queue:call", called);
      s.off("connect", up);
      s.off("disconnect", down);
      s.off("connect_error", down);
    };
  }, [token]);

  return connected;
}

/**
 * ฟังสัญญาณ real-time ตามชื่อ เช่น "billing:changed", "consent:changed", "kiosk:open"
 * ต่อกลับมาหลังหลุด → เรียก onReconnect (ถ้ามี) ให้หน้าจอดึงข้อมูลใหม่
 */
export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void, onReconnect?: () => void) {
  const token = useSession((s) => s.token);
  const [connected, setConnected] = useState(false);
  const ref = useRef({ handler, onReconnect });
  useEffect(() => {
    ref.current = { handler, onReconnect };
  });

  useEffect(() => {
    if (!token) return;
    const s = getSocket(token);
    const on = (p: T) => ref.current.handler(p);
    const up = () => {
      setConnected(true);
      ref.current.onReconnect?.();
    };
    const down = () => setConnected(false);
    s.on(event, on);
    s.on("connect", up);
    s.on("disconnect", down);
    s.on("connect_error", down);
    if (s.connected) setTimeout(() => setConnected(true), 0);
    return () => {
      s.off(event, on);
      s.off("connect", up);
      s.off("disconnect", down);
      s.off("connect_error", down);
    };
  }, [token, event]);

  return connected;
}
