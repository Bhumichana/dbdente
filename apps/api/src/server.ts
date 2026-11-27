import cors from "cors";
import express, { type NextFunction, type Response } from "express";
import multer from "multer";
import { requireAuth, requireRole, signToken, type AuthedRequest } from "./auth.js";
import { config } from "./config.js";
import {
  dicomPatientId,
  type FilmType,
  type Patient,
  type Surface,
  type ToothRecord,
  type ToothStatus,
} from "./domain.js";
import { createImageSource } from "./imaging/index.js";
import { assignPatient, parseMeta } from "./imaging/dicom.js";
import { ByteLru } from "./imaging/lru.js";
import { audit, getDb, readAudit, save } from "./store.js";

const images = createImageSource();
const fileCache = new ByteLru(256 * 1024 * 1024);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const app = express();
app.use(cors({ origin: config.webOrigin.includes("*") ? true : config.webOrigin, exposedHeaders: ["Content-Length"] }));
app.use(express.json());

const CLINICAL = ["owner", "dentist", "assistant"] as const;
const FILM_TYPES: FilmType[] = ["PA", "BW", "PANO", "CEPH", "OTHER"];
const SURFACES: Surface[] = ["M", "O", "D", "B", "L"];
const STATUSES: ToothStatus[] = ["existing", "planned", "completed"];

const isValidTooth = (t: number) => {
  const q = Math.floor(t / 10);
  const n = t % 10;
  return (q >= 1 && q <= 4 && n >= 1 && n <= 8) || (q >= 5 && q <= 8 && n >= 1 && n <= 5);
};

// ---------- helpers ----------
type Handler = (req: AuthedRequest, res: Response) => Promise<unknown> | unknown;
const h = (fn: Handler) => (req: AuthedRequest, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).catch(next);

/** ดึงคนไข้โดยบังคับว่าต้องอยู่ในคลินิกเดียวกับผู้ใช้ (tenant isolation) */
function patientOf(req: AuthedRequest): Patient | null {
  const p = getDb().patients.find((x) => x.id === req.params.patientId);
  return p && p.clinicId === req.user!.clinicId ? p : null;
}

function pidOf(p: Patient) {
  const clinic = getDb().clinics.find((c) => c.id === p.clinicId)!;
  return dicomPatientId(clinic, p);
}

const ctx = (req: AuthedRequest) => ({ userId: req.user!.id, clinicId: req.user!.clinicId, ip: req.ip });

function guessFilmType(m: { modality: string; rows: number; columns: number; seriesDescription: string }): FilmType {
  const d = m.seriesDescription.toUpperCase();
  if (/PANO/.test(d)) return "PANO";
  if (/CEPH/.test(d)) return "CEPH";
  if (/BW|BITEWING/.test(d)) return "BW";
  if (m.modality === "IO") return "PA";
  if (m.columns > m.rows * 1.6) return "PANO";
  return "OTHER";
}

// ---------- auth ----------
app.get("/api/health", (_req, res) => res.json({ ok: true, imageSource: images.name }));

// เดโม: เลือกผู้ใช้จากรายการแทนการกรอกรหัสผ่าน (ระยะ 1 จะใช้ระบบ login จริง)
app.get("/api/auth/demo-users", (_req, res) => {
  const { users, clinics } = getDb();
  res.json(users.map((u) => ({ ...u, clinicName: clinics.find((c) => c.id === u.clinicId)?.name })));
});

app.post("/api/auth/demo-login", (req, res) => {
  const user = getDb().users.find((u) => u.id === req.body?.userId);
  if (!user) return void res.status(404).json({ error: "ไม่พบผู้ใช้" });
  audit({ userId: user.id, clinicId: user.clinicId, action: "LOGIN", ip: req.ip });
  res.json({ token: signToken(user), user });
});

app.use("/api", requireAuth);

app.get("/api/me", (req: AuthedRequest, res) => {
  const clinic = getDb().clinics.find((c) => c.id === req.user!.clinicId);
  res.json({ user: req.user, clinic, imageSource: images.name });
});

// ---------- patients ----------
app.get("/api/patients", (req: AuthedRequest, res) => {
  const q = String(req.query.q ?? "").trim().toLowerCase();
  const list = getDb().patients.filter(
    (p) =>
      p.clinicId === req.user!.clinicId &&
      (!q || p.fullName.toLowerCase().includes(q) || p.hn.toLowerCase().includes(q)),
  );
  res.json(list);
});

app.get("/api/patients/:patientId", (req: AuthedRequest, res) => {
  const p = patientOf(req);
  if (!p) return void res.status(404).json({ error: "ไม่พบคนไข้" });
  audit({ ...ctx(req), action: "VIEW_PATIENT", patientId: p.id });
  res.json({ ...p, dicomPatientId: pidOf(p) });
});

// ---------- tooth chart ----------
app.get("/api/patients/:patientId/chart", requireRole(...CLINICAL), (req: AuthedRequest, res) => {
  const p = patientOf(req);
  if (!p) return void res.status(404).json({ error: "ไม่พบคนไข้" });
  res.json(Object.values(getDb().charts[p.id] ?? {}));
});

app.put(
  "/api/patients/:patientId/chart/:tooth",
  requireRole("owner", "dentist"),
  (req: AuthedRequest, res) => {
    const p = patientOf(req);
    const tooth = Number(req.params.tooth);
    if (!p) return void res.status(404).json({ error: "ไม่พบคนไข้" });
    if (!isValidTooth(tooth)) return void res.status(400).json({ error: "เลขฟัน FDI ไม่ถูกต้อง" });

    const body = req.body as Partial<ToothRecord>;
    const surfaces: ToothRecord["surfaces"] = {};
    for (const [s, st] of Object.entries(body.surfaces ?? {})) {
      if (SURFACES.includes(s as Surface) && STATUSES.includes(st as ToothStatus)) surfaces[s as Surface] = st;
    }
    const whole =
      body.whole && ([...STATUSES, "missing"] as string[]).includes(body.whole) ? body.whole : undefined;

    const db = getDb();
    db.charts[p.id] ??= {};
    if (!Object.keys(surfaces).length && !whole && !body.procedure && !body.note) {
      delete db.charts[p.id][tooth];
    } else {
      db.charts[p.id][tooth] = {
        tooth,
        surfaces,
        whole,
        procedure: body.procedure?.slice(0, 200),
        note: body.note?.slice(0, 2000),
        updatedAt: new Date().toISOString(),
        updatedBy: req.user!.id,
      };
    }
    save();
    audit({ ...ctx(req), action: "UPDATE_CHART", patientId: p.id, target: String(tooth) });
    res.json(db.charts[p.id][tooth] ?? null);
  },
);

// ---------- images ----------
app.get(
  "/api/patients/:patientId/images",
  requireRole(...CLINICAL),
  h(async (req, res) => {
    const p = patientOf(req);
    if (!p) return res.status(404).json({ error: "ไม่พบคนไข้" });
    const links = getDb().imageLinks;
    const list = (await images.listByPatient(pidOf(p))).map((m) => ({
      ...m,
      filmType: links[m.sopInstanceUid]?.filmType ?? guessFilmType(m),
      teeth: links[m.sopInstanceUid]?.teeth ?? [],
    }));
    list.sort((a, b) => b.studyDate.localeCompare(a.studyDate));
    res.json(list);
  }),
);

/** ตรวจว่า instance เป็นของคนไข้รายนี้จริง ก่อนส่งไฟล์ออก (กันการเดา UID ข้ามคลินิก) */
async function instanceOf(req: AuthedRequest, res: Response) {
  const p = patientOf(req);
  if (!p) return void res.status(404).json({ error: "ไม่พบคนไข้" });
  const meta = await images.find(String(req.params.sop));
  if (!meta || meta.patientId !== pidOf(p)) return void res.status(404).json({ error: "ไม่พบภาพ" });
  return { p, meta };
}

app.get(
  "/api/patients/:patientId/images/:sop/file",
  requireRole(...CLINICAL),
  h(async (req, res) => {
    const found = await instanceOf(req, res);
    if (!found) return;
    let buf = fileCache.get(found.meta.sopInstanceUid);
    if (!buf) {
      buf = await images.retrieve(found.meta);
      fileCache.set(found.meta.sopInstanceUid, buf);
    }
    audit({ ...ctx(req), action: "VIEW_IMAGE", patientId: found.p.id, target: found.meta.sopInstanceUid });
    res.set({ "Content-Type": "application/dicom", "Cache-Control": "private, no-store" }).send(buf);
  }),
);

app.get(
  "/api/patients/:patientId/images/:sop/thumbnail",
  requireRole(...CLINICAL),
  h(async (req, res) => {
    const found = await instanceOf(req, res);
    if (!found) return;
    const t = await images.thumbnail(found.meta);
    if (!t) return res.status(415).json({ error: "สร้าง thumbnail ไม่ได้" });
    res.set({ "Content-Type": t.contentType, "Cache-Control": "private, max-age=3600" }).send(t.body);
  }),
);

app.put(
  "/api/patients/:patientId/images/:sop/link",
  requireRole("owner", "dentist", "assistant"),
  h(async (req, res) => {
    const found = await instanceOf(req, res);
    if (!found) return;
    const teeth = Array.isArray(req.body?.teeth)
      ? [...new Set((req.body.teeth as unknown[]).map(Number).filter(isValidTooth))].sort()
      : [];
    const filmType = FILM_TYPES.includes(req.body?.filmType) ? (req.body.filmType as FilmType) : guessFilmType(found.meta);
    const link = { sopInstanceUid: found.meta.sopInstanceUid, patientId: found.p.id, filmType, teeth };
    getDb().imageLinks[link.sopInstanceUid] = link;
    save();
    audit({ ...ctx(req), action: "LINK_IMAGE", patientId: found.p.id, target: `${link.sopInstanceUid}:${teeth.join(",")}` });
    res.json(link);
  }),
);

app.post(
  "/api/patients/:patientId/images",
  requireRole(...CLINICAL),
  upload.single("file"),
  h(async (req, res) => {
    const p = patientOf(req);
    if (!p) return res.status(404).json({ error: "ไม่พบคนไข้" });
    if (!req.file) return res.status(400).json({ error: "ไม่พบไฟล์" });
    const clinic = getDb().clinics.find((c) => c.id === p.clinicId)!;
    let buf: Buffer;
    try {
      buf = assignPatient(req.file.buffer, {
        patientId: pidOf(p),
        name: p.fullName,
        issuer: clinic.code,
        birthDate: p.birthDate,
        sex: p.sex,
      });
    } catch {
      return res.status(400).json({ error: "อ่านไฟล์ DICOM ไม่ได้ (ระยะ 0 รองรับเฉพาะ .dcm)" });
    }
    // ภาพเดียวกัน (SOP UID เดิม) ห้ามย้ายไปเป็นของคนไข้อื่น — กันการเขียนทับฟิล์มของคนไข้คนอื่น
    const existing = await images.find(parseMeta(buf).sopInstanceUid);
    if (existing && existing.patientId !== pidOf(p)) {
      return res.status(409).json({ error: "ภาพนี้เป็นของคนไข้รายอื่นอยู่แล้ว (SOP Instance UID ซ้ำ)" });
    }
    const meta = await images.store(buf);
    const teeth = String(req.body?.teeth ?? "")
      .split(",")
      .map(Number)
      .filter(isValidTooth);
    const filmType = FILM_TYPES.includes(req.body?.filmType) ? (req.body.filmType as FilmType) : guessFilmType(meta);
    getDb().imageLinks[meta.sopInstanceUid] = { sopInstanceUid: meta.sopInstanceUid, patientId: p.id, filmType, teeth };
    save();
    audit({ ...ctx(req), action: "UPLOAD_IMAGE", patientId: p.id, target: meta.sopInstanceUid });
    res.status(201).json({ ...meta, filmType, teeth });
  }),
);

// ---------- audit ----------
app.get("/api/audit", requireRole("owner"), (req: AuthedRequest, res) => {
  const { users, patients } = getDb();
  res.json(
    readAudit(req.user!.clinicId).map((e) => ({
      ...e,
      userName: users.find((u) => u.id === e.userId)?.name,
      patientName: patients.find((p) => p.id === e.patientId)?.fullName,
    })),
  );
});

app.use((err: Error, _req: AuthedRequest, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(502).json({ error: err.message });
});

app.listen(config.port, () => {
  console.log(`DBDente API http://localhost:${config.port}  (image source: ${images.name})`);
});
