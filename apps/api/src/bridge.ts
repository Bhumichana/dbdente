/**
 * Local Bridge (Phase 2): โปรแกรมในคลินิกที่รับไฟล์จากเครื่อง X-ray แล้วส่งเข้า PACS
 * - ฝั่งเครื่อง (/api/bridge/device/*) ยืนยันตัวด้วย token ประจำเครื่อง (เก็บเป็น SHA-256) ไม่ใช้ JWT ของผู้ใช้
 * - heartbeat ทุก ~30 วินาที → ตอบกลับงานที่ต้องทำ (ไฟล์ที่เจ้าหน้าที่จับคู่ HN แล้ว / สั่งส่งซ้ำ)
 * - ฝั่งเจ้าหน้าที่ดูสถานะ จับคู่ไฟล์กับคนไข้ และสั่งส่งซ้ำ
 */
import crypto from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { requireRole, type AuthedRequest } from "./auth.js";
import { dicomPatientId, type Bridge, type BridgeFile } from "./domain.js";
import { audit, getDb, save } from "./store.js";

export const ONLINE_MS = 2 * 60_000;
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const bad = (res: Response, status: number, error: string) => void res.status(status).json({ error });
const ctx = (req: AuthedRequest) => ({ userId: req.user!.id, clinicId: req.user!.clinicId, ip: req.ip });

interface DeviceRequest extends Request {
  bridge?: Bridge;
}

function requireBridge(req: DeviceRequest, res: Response, next: NextFunction) {
  const token = (req.headers.authorization ?? "").replace(/^Bridge /, "");
  const b = token && getDb().bridges.find((x) => x.tokenHash === sha256(token));
  if (!b) return bad(res, 401, "unknown bridge");
  req.bridge = b;
  next();
}

const jobsFor = (b: Bridge) => {
  const db = getDb();
  const clinic = db.clinics.find((c) => c.id === b.clinicId)!;
  return db.bridgeFiles
    .filter((f) => f.bridgeId === b.id && (f.status === "matched" || f.status === "retry"))
    .map((f) => {
      const p = db.patients.find((x) => x.id === f.patientId);
      return { fileId: f.id, fileName: f.fileName, patientId: p ? dicomPatientId(clinic, p) : undefined };
    });
};

/** ต้องลงทะเบียนก่อน middleware JWT ของ /api */
export function registerBridgeDeviceRoutes(app: Express) {
  app.post("/api/bridge/device/heartbeat", requireBridge, (req: DeviceRequest, res) => {
    const b = req.bridge!;
    b.lastSeenAt = new Date().toISOString();
    b.version = String(req.body?.version ?? b.version ?? "").slice(0, 20) || undefined;
    b.queue = Math.max(0, Math.min(10000, Number(req.body?.queue) || 0));
    save();
    res.json({ jobs: jobsFor(b) });
  });

  /** รายงานไฟล์ใหม่ที่รับจากเครื่อง X-ray (ส่งเข้า PACS เองได้ → sent, อ่าน HN ไม่ได้ → unmatched) */
  app.post("/api/bridge/device/files", requireBridge, (req: DeviceRequest, res) => {
    const b = req.bridge!;
    const status = req.body?.status as BridgeFile["status"];
    if (!["unmatched", "sent", "failed"].includes(status)) return bad(res, 400, "bad status");
    const now = new Date().toISOString();
    const f: BridgeFile = {
      id: crypto.randomUUID(),
      clinicId: b.clinicId,
      bridgeId: b.id,
      fileName: String(req.body?.fileName ?? "").slice(0, 200) || "unknown",
      modality: String(req.body?.modality ?? "IO").slice(0, 10),
      receivedAt: now,
      status,
      patientHint: String(req.body?.patientHint ?? "").slice(0, 100) || undefined,
      error: status === "failed" ? String(req.body?.error ?? "").slice(0, 300) || "unknown error" : undefined,
      attempts: status === "unmatched" ? 0 : 1,
      updatedAt: now,
    };
    getDb().bridgeFiles.push(f);
    save();
    res.status(201).json({ id: f.id });
  });

  /** ผลการส่งงาน (หลังจับคู่/ส่งซ้ำ) */
  app.post("/api/bridge/device/files/:id/result", requireBridge, (req: DeviceRequest, res) => {
    const f = getDb().bridgeFiles.find((x) => x.id === req.params.id && x.bridgeId === req.bridge!.id);
    if (!f) return bad(res, 404, "not found");
    f.attempts += 1;
    f.status = req.body?.ok ? "sent" : "failed";
    f.error = req.body?.ok ? undefined : String(req.body?.error ?? "unknown error").slice(0, 300);
    f.updatedAt = new Date().toISOString();
    save();
    res.json({ ok: true });
  });
}

export function registerBridgeRoutes(app: Express) {
  const ROLES = ["owner", "assistant"] as const;

  app.get("/api/bridge", requireRole(...ROLES), (req: AuthedRequest, res) => {
    const db = getDb();
    const now = Date.now();
    const files = db.bridgeFiles.filter((f) => f.clinicId === req.user!.clinicId).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    res.json({
      bridges: db.bridges
        .filter((b) => b.clinicId === req.user!.clinicId)
        .map(({ tokenHash: _t, ...b }) => ({
          ...b,
          online: !!b.lastSeenAt && now - Date.parse(b.lastSeenAt) < ONLINE_MS,
          sentToday: files.filter((f) => f.bridgeId === b.id && f.status === "sent" && now - Date.parse(f.updatedAt) < 864e5).length,
        })),
      files: files.slice(0, 100).map((f) => {
        const p = db.patients.find((x) => x.id === f.patientId);
        return { ...f, bridgeName: db.bridges.find((b) => b.id === f.bridgeId)?.name, patient: p && { id: p.id, hn: p.hn, fullName: p.fullName } };
      }),
    });
  });

  const find = (req: AuthedRequest) => getDb().bridgeFiles.find((f) => f.id === req.params.id && f.clinicId === req.user!.clinicId);

  /** จับคู่ไฟล์ที่อ่าน HN ไม่ได้กับคนไข้ → Bridge ส่งเข้า PACS ในรอบ heartbeat ถัดไป */
  app.post("/api/bridge/files/:id/match", requireRole(...ROLES), (req: AuthedRequest, res) => {
    const f = find(req);
    if (!f) return bad(res, 404, "ไม่พบไฟล์");
    if (f.status !== "unmatched") return bad(res, 409, "ไฟล์นี้จับคู่แล้ว");
    const p = getDb().patients.find((x) => x.id === req.body?.patientId && x.clinicId === f.clinicId);
    if (!p) return bad(res, 400, "เลือกคนไข้");
    Object.assign(f, { patientId: p.id, status: "matched", matchedBy: req.user!.id, updatedAt: new Date().toISOString() });
    save();
    audit({ ...ctx(req), action: "BRIDGE_MATCH", patientId: p.id, target: f.id });
    res.json(f);
  });

  app.post("/api/bridge/files/:id/retry", requireRole(...ROLES), (req: AuthedRequest, res) => {
    const f = find(req);
    if (!f) return bad(res, 404, "ไม่พบไฟล์");
    if (f.status !== "failed") return bad(res, 409, "ส่งซ้ำได้เฉพาะไฟล์ที่ส่งไม่สำเร็จ");
    Object.assign(f, { status: "retry", updatedAt: new Date().toISOString() });
    save();
    audit({ ...ctx(req), action: "BRIDGE_RETRY", target: f.id });
    res.json(f);
  });
}
