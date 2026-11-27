/**
 * ตรวจการเชื่อมต่อ dcm4chee แบบอ่านอย่างเดียว (ไม่เขียนอะไรลง PACS)
 *
 *   npm run pacs:check                                  → auth + QIDO 5 studies ล่าสุด
 *   npm run pacs:check -- --patient <PatientID>         → + ดึงภาพจริง (WADO) และ thumbnail พร้อมจับเวลา
 *   npm run pacs:check -- --patient <PatientID> --link p1
 *                                                       → ผูกคนไข้เดโม p1 กับ PatientID นี้ เพื่อเปิดใน Viewer
 *
 * แสดงเฉพาะ PatientID / วันที่ / modality — ไม่พิมพ์ชื่อคนไข้
 */
import { config } from "../src/config.js";
import { parseMeta } from "../src/imaging/dicom.js";
import { Dcm4cheeSource } from "../src/imaging/dcm4cheeSource.js";
import { getDb, save } from "../src/store.js";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const patientId = arg("patient");
const link = arg("link");

const ok = (s: string) => console.log(`  ✓ ${s}`);
const fail = (s: string, e: unknown): never => {
  console.log(`  ✗ ${s}: ${(e as Error)?.message ?? e}`);
  process.exit(1);
};
const timed = async <T>(fn: () => Promise<T>) => {
  const t0 = performance.now();
  const v = await fn();
  return [v, Math.round(performance.now() - t0)] as const;
};

const { rsUrl, wadoUrl, token, kc, readOnly } = config.dcm4chee;
if (!rsUrl) fail("config", "ยังไม่ได้ตั้ง DCM4CHEE_RS_URL ใน apps/api/.env");

console.log("1) Config");
ok(`QIDO/STOW : ${rsUrl}`);
ok(`WADO-URI  : ${wadoUrl}`);
ok(`Auth      : ${token ? "Bearer token (static)" : kc.tokenUrl ? `Keycloak client_credentials (${kc.clientId})` : "ไม่มี"}`);
ok(`Read-only : ${readOnly ? "ใช่ (ปลอดภัย ไม่เขียนลง PACS)" : "ไม่ — STOW ถูกเปิดไว้"}`);

const src = new Dcm4cheeSource();

console.log("2) Auth");
const headers = await src.authHeaders().catch((e) => fail("ขอ token ไม่สำเร็จ", e));
ok(headers.Authorization ? "ได้ token แล้ว" : "ไม่ใช้ token");

console.log("3) QIDO-RS — studies ล่าสุด");
{
  const qs = new URLSearchParams({ limit: "5", orderby: "-StudyDate", includefield: "00100020,00080061,00201208" });
  const [res, ms] = await timed(() =>
    fetch(`${rsUrl}/studies?${qs}`, { headers: { Accept: "application/dicom+json", ...headers } }),
  ).catch((e) => fail("เชื่อมต่อไม่ได้ (เช็ก URL / VPN / firewall)", e));
  if (res.status === 401 || res.status === 403) fail(`QIDO ${res.status}`, "สิทธิ์ไม่พอ — เช็ก token/role ของ client");
  if (!res.ok && res.status !== 204) fail(`QIDO ${res.status}`, await res.text());
  const list = res.status === 204 ? [] : ((await res.json()) as Record<string, { Value?: unknown[] }>[]);
  ok(`HTTP ${res.status} ใน ${ms} ms, ได้ ${list.length} studies`);
  for (const s of list) {
    const v = (t: string) => s[t]?.Value ?? [];
    console.log(
      `     PatientID=${v("00100020")[0] ?? "?"}  date=${v("00080020")[0] ?? "?"}  modality=${v("00080061").join("/") || "?"}  images=${v("00201208")[0] ?? "?"}`,
    );
  }
}

if (!patientId) {
  console.log("\nเสร็จ — ระบุ --patient <PatientID> เพื่อทดสอบดึงภาพจริง");
  process.exit(0);
}

console.log(`4) QIDO-RS — instances ของ PatientID=${patientId}`);
const [instances, qms] = await timed(() => src.listByPatient(patientId)).catch((e) => fail("QIDO instances", e));
if (!instances.length) fail("ไม่พบภาพ", "PatientID นี้ไม่มี instance ใน AE นี้");
const byMod = instances.reduce<Record<string, number>>((a, m) => ((a[m.modality || "?"] = (a[m.modality || "?"] ?? 0) + 1), a), {});
ok(`${instances.length} instances ใน ${qms} ms — ${Object.entries(byMod).map(([k, n]) => `${k}:${n}`).join(", ")}`);

const first = instances.find((m) => ["IO", "PX", "DX", "CR"].includes(m.modality)) ?? instances[0];
console.log(`5) WADO-URI — ดึงไฟล์ (${first.modality} ${first.studyDate} ${first.columns}x${first.rows})`);
const [buf, wms] = await timed(() => src.retrieve(first)).catch((e) => fail("WADO", e));
const meta = (() => {
  try {
    return parseMeta(buf);
  } catch (e) {
    return fail("ไฟล์ที่ได้ไม่ใช่ DICOM Part 10", e);
  }
})();
const ts = buf.subarray(0, 4096).toString("latin1").match(/1\.2\.840\.10008\.1\.2[\d.]*/)?.[0] ?? "?";
ok(`${(buf.byteLength / 1024 / 1024).toFixed(2)} MB ใน ${wms} ms (เป้า < 1500 ms) — Transfer Syntax ${ts}`);
if (meta.sopInstanceUid !== first.sopInstanceUid) fail("SOP UID ไม่ตรง", meta.sopInstanceUid);

console.log("6) Thumbnail");
const [thumb, tms] = await timed(() => src.thumbnail(first));
ok(thumb ? `${thumb.contentType} ${(thumb.body.byteLength / 1024).toFixed(0)} KB ใน ${tms} ms` : "สร้างไม่ได้ (ไฟล์บีบอัดและ /rendered ใช้ไม่ได้)");

if (link) {
  const p = getDb().patients.find((x) => x.id === link);
  if (!p) fail("--link", `ไม่พบคนไข้เดโม ${link} (มี: ${getDb().patients.map((x) => x.id).join(", ")})`);
  p!.pacsPatientId = patientId;
  save();
  console.log(`7) ผูกคนไข้เดโม ${p!.id} (${p!.hn}) → PatientID ${patientId} แล้ว — รีสตาร์ท API แล้วเปิดคนไข้รายนี้ในเว็บ`);
}

console.log("\nผ่านทุกขั้น ✓");
