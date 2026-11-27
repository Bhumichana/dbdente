import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { config } from "./config.js";
import { getDb } from "./store.js";

/**
 * Real-time ของคิว/เก้าอี้ (Socket.io)
 *  - ต้องส่ง JWT ตอนเชื่อมต่อ (auth.token) — ไม่มี token เชื่อมไม่ได้
 *  - แยกห้องตามคลินิก ข้อมูลไม่ข้ามคลินิก
 *  - ส่งเฉพาะ "สัญญาณ" ว่ามีการเปลี่ยนแปลง ข้อมูลจริงให้ client ดึงผ่าน REST (ตรวจสิทธิ์ตามบทบาท)
 */
let io: Server | null = null;

export function attachRealtime(server: HttpServer, origin: boolean | string[]) {
  io = new Server(server, { cors: { origin } });
  io.use((socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? "");
      const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
      const user = getDb().users.find((u) => u.id === payload.sub);
      if (!user) throw new Error("unknown user");
      socket.data.clinicId = user.clinicId;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });
  io.on("connection", (socket) => socket.join(`clinic:${socket.data.clinicId}`));
}

export type RealtimeEvent =
  | { type: "queue:changed" }
  /** เรียกคิวขึ้นจอ: เลขคิว + ห้อง (ไม่มีชื่อเต็ม) */
  | { type: "queue:call"; queueNo: string; chairName: string; maskedName: string };

export function notify(clinicId: string, e: RealtimeEvent) {
  io?.to(`clinic:${clinicId}`).emit(e.type, e);
}
