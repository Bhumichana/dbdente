/**
 * จำลอง Local Bridge (ใช้ทดสอบหน้า "Local Bridge" โดยไม่ต้องมีเครื่อง X-ray จริง)
 *   npm run bridge:sim                      → เครื่อง "ห้อง X-ray 1" (token เดโม)
 *   BRIDGE_TOKEN=demo-bridge-2 npm run bridge:sim
 * ทำงาน: ส่ง heartbeat ทุก 15 วินาที · รับงานที่เจ้าหน้าที่จับคู่ HN/สั่งส่งซ้ำ แล้วรายงานว่าส่งเข้า PACS สำเร็จ
 * (จำลองเท่านั้น — ไม่ได้ส่งไฟล์เข้า PACS จริง)
 */
const API = (process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const TOKEN = process.env.BRIDGE_TOKEN ?? "demo-bridge-1";
const headers = { Authorization: `Bridge ${TOKEN}`, "Content-Type": "application/json" };

async function post(path: string, body: unknown) {
  const r = await fetch(`${API}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function tick() {
  const { jobs } = (await post("/api/bridge/device/heartbeat", { version: "0.3.1-sim", queue: 0 })) as {
    jobs: { fileId: string; fileName: string; patientId?: string }[];
  };
  for (const j of jobs) {
    const ok = !!j.patientId;
    await post(`/api/bridge/device/files/${j.fileId}/result`, ok ? { ok: true } : { ok: false, error: "ไม่มี PatientID" });
    console.log(`${new Date().toLocaleTimeString("th-TH")}  ${ok ? "✓ ส่งแล้ว" : "✗ ส่งไม่สำเร็จ"}  ${j.fileName} → ${j.patientId ?? "-"}`);
  }
}

console.log(`Bridge simulator → ${API} (Ctrl+C เพื่อหยุด)`);
for (;;) {
  try {
    await tick();
  } catch (e) {
    console.error((e as Error).message);
  }
  await new Promise((r) => setTimeout(r, 15_000));
}
