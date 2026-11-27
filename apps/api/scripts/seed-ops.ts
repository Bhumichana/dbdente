/**
 * ข้อมูลเดโม Phase 2–3: ประวัติย้อนหลัง ~2 เดือน (ให้ Dashboard / DF มีตัวเลข), แผนผ่อน, มัดจำ,
 * งานแล็บ, สต็อกวัสดุ และ Local Bridge — ข้อมูลสมมติทั้งหมด สุ่มแบบกำหนด seed (ได้ผลเดิมทุกครั้ง)
 */
import crypto from "node:crypto";
import type { Appointment, Db, Invoice, InvoiceItem, Patient, PaymentMethod, StockItem } from "../src/domain.js";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const TZ = "Asia/Bangkok";
const localDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const addMonths = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
};
/** เวลาไทย → ISO */
const at = (date: string, hm: string) => new Date(`${date}T${hm}:00+07:00`).toISOString();
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedOperations(db: Db, opts: { clinicId: string; today: string; uid: (k: string) => string }) {
  const { clinicId, today, uid } = opts;
  const rnd = mulberry32(20261127);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const id = (k: string) => uid(k).slice(-16);
  const proc = (code: string) => db.procedures.find((p) => p.code === code)!;

  // ---------- วัสดุต่อหัตถการ (ตัดสต็อก) + ค่าวัสดุ (หักก่อนคิด DF) ----------
  db.procedures.push({
    id: "pr-impl",
    clinicId,
    code: "IMPL",
    category: "ทันตกรรมประดิษฐ์",
    name: "รากฟันเทียม (ต่อซี่)",
    price: 45000_00,
    keywords: ["รากเทียม", "implant"],
  });
  const BOM: Record<string, { cost: number; m: [string, number][] }> = {
    SCALE: { cost: 50_00, m: [["st-paste", 1], ["st-glove", 0.02]] },
    FLUOR: { cost: 80_00, m: [["st-fluor", 1]] },
    SEAL: { cost: 80_00, m: [["st-sealant", 0.1], ["st-etch", 0.05]] },
    COMP1: { cost: 150_00, m: [["st-anes", 1], ["st-needle", 1], ["st-comp", 0.1], ["st-bond", 0.05], ["st-etch", 0.05]] },
    COMP2: { cost: 200_00, m: [["st-anes", 1], ["st-needle", 1], ["st-comp", 0.15], ["st-bond", 0.05], ["st-etch", 0.05]] },
    EXT: { cost: 100_00, m: [["st-anes", 1], ["st-needle", 1], ["st-gauze", 1]] },
    SURG: { cost: 300_00, m: [["st-anes", 2], ["st-needle", 2], ["st-suture", 1], ["st-gauze", 2]] },
    RCTM: { cost: 800_00, m: [["st-anes", 1], ["st-needle", 1], ["st-gp", 0.1], ["st-file", 0.2]] },
    CROWN: { cost: 300_00, m: [["st-imp", 0.2]] },
    IMPL: { cost: 9000_00, m: [["st-anes", 2], ["st-needle", 2], ["st-suture", 1]] },
  };
  for (const [code, b] of Object.entries(BOM)) Object.assign(proc(code), { materialCost: b.cost, materials: b.m.map(([itemId, qty]) => ({ itemId, qty })) });

  // ---------- สต็อก ----------
  const lot = (no: string, qty: number, expiryDays?: number) => ({ id: id(`lot:${no}`), lot: no, qty, expiry: expiryDays == null ? undefined : addDays(today, expiryDays) });
  const items: StockItem[] = [
    ["st-anes", "ANES", "ยาชา Lidocaine 2% + Epinephrine", "หลอด", "ยา", 50, [lot("LD2604", 38, 25), lot("LD2611", 120, 420)]],
    ["st-needle", "NDL", "เข็มฉีดยาชา 27G สั้น", "ชิ้น", "เข็มและหลอดฉีด", 100, [lot("ND2608", 260, 600)]],
    ["st-comp", "COMP", "Composite resin A2 (4 g)", "หลอด", "วัสดุอุดฟัน", 5, [lot("CA2603", 3.4, 45), lot("CA2609", 6, 300)]],
    ["st-bond", "BOND", "Bonding agent 5 ml", "ขวด", "วัสดุอุดฟัน", 2, [lot("BD2607", 1.6, 210)]],
    ["st-etch", "ETCH", "กรดกัดฟัน 37% (เจล)", "หลอด", "วัสดุอุดฟัน", 3, [lot("ET2605", 5.2, 150)]],
    ["st-gp", "GP", "Gutta-percha points F2", "กล่อง", "รักษารากฟัน", 3, [lot("GP2601", 4.5, 500)]],
    ["st-file", "FILE", "ไฟล์ขยายคลองราก NiTi", "ชุด", "รักษารากฟัน", 5, [lot("NF2606", 3.2)]],
    ["st-sealant", "SEAL", "วัสดุเคลือบหลุมร่องฟัน", "หลอด", "ป้องกัน", 2, [lot("SL2602", 2.1, -12), lot("SL2610", 2, 330)]],
    ["st-fluor", "FLUOR", "ฟลูออไรด์วาร์นิช 0.4 ml", "ชิ้น", "ป้องกัน", 20, [lot("FV2607", 46, 260)]],
    ["st-paste", "PASTE", "ผงขัดฟัน Prophy paste", "ถ้วย", "ป้องกัน", 30, [lot("PP2608", 140, 380)]],
    ["st-suture", "SUT", "ไหมเย็บแผล 4-0", "ซอง", "ศัลยกรรม", 10, [lot("SU2605", 7, 40)]],
    ["st-gauze", "GAUZE", "ผ้าก๊อซปลอดเชื้อ 2x2", "ห่อ", "ศัลยกรรม", 20, [lot("GZ2609", 85, 700)]],
    ["st-imp", "ALG", "วัสดุพิมพ์ปาก Alginate 450 g", "ถุง", "พิมพ์ปาก", 3, [lot("AL2608", 4.4, 240)]],
    ["st-glove", "GLOVE", "ถุงมือยางไนไตรล์ ไซซ์ M", "กล่อง", "ป้องกันการติดเชื้อ", 5, [lot("GL2610", 12)]],
    ["st-mask", "MASK", "หน้ากากอนามัย", "กล่อง", "ป้องกันการติดเชื้อ", 5, [lot("MK2609", 4)]],
  ].map(([itemId, code, name, unit, category, reorderPoint, lots]) => ({
    id: itemId as string,
    clinicId,
    code: code as string,
    name: name as string,
    unit: unit as string,
    category: category as string,
    reorderPoint: reorderPoint as number,
    lots: lots as StockItem["lots"],
  }));
  db.stockItems = items;
  const opening = at(addDays(today, -60), "08:30");
  for (const it of items)
    for (const l of it.lots)
      db.stockMoves.push({ id: id(`mv:${it.id}:${l.lot}`), clinicId, itemId: it.id, type: "in", qty: l.qty, lot: l.lot, reason: "ยอดยกมา", by: "u4", at: opening });

  // ---------- คนไข้ (เพิ่ม) + วันที่ลงทะเบียน ----------
  const NAMES: [string, "M" | "F"][] = [
    ["สมศักดิ์ บุญมา", "M"], ["มาลัย ทองคำ", "F"], ["ประเสริฐ ศรีสุข", "M"], ["สุนีย์ แก้วมณี", "F"], ["อนุชา สุขใจ", "M"], ["จิราพร มีชัย", "F"],
    ["ธีระ พรหมมา", "M"], ["ศิริพร วงศ์ใหญ่", "F"], ["วีระ จันทร์เพ็ญ", "M"], ["ปิยนุช อินทร์แก้ว", "F"], ["กิตติพงษ์ รุ่งเรือง", "M"], ["รัตนา สายบุญ", "F"],
    ["สุรชัย ทองดี", "M"], ["อรุณี เพชรรัตน์", "F"], ["ชาญ กล้าหาญ", "M"], ["พรทิพย์ บุญมา", "F"], ["ณัฐพล ทองคำ", "M"], ["สุภาวดี ศรีสุข", "F"],
    ["วิชัย แก้วมณี", "M"], ["กาญจนา สุขใจ", "F"], ["ธนพร มีชัย", "F"], ["อำนาจ พรหมมา", "M"], ["ลัดดา วงศ์ใหญ่", "F"], ["ศุภชัย จันทร์เพ็ญ", "M"],
    ["นิภา อินทร์แก้ว", "F"], ["พงศกร รุ่งเรือง", "M"], ["เบญจวรรณ สายบุญ", "F"], ["สมบัติ ทองดี", "M"], ["ดวงใจ เพชรรัตน์", "F"], ["ภาณุ กล้าหาญ", "M"],
    ["อัญชลี บุญมา", "F"], ["ไพโรจน์ ทองคำ", "M"], ["สายสุนีย์ ศรีสุข", "F"], ["ชนินทร์ แก้วมณี", "M"], ["ปราณี สุขใจ", "F"], ["เอกชัย มีชัย", "M"],
  ];
  const created: Record<string, string> = { p1: "2025-11-03", p2: "2026-06-12", p3: "2026-01-15", p4: "2026-03-02", p5: "2025-12-20", p6: "2026-04-08", p7: "2026-07-20", p8: addDays(today, -40), p9: addDays(today, -12) };
  for (const p of db.patients) p.createdAt = at(created[p.id] ?? addDays(today, -90), "09:00");
  const maxHn = Math.max(...db.patients.map((p) => Number(p.hn.slice(2))));
  NAMES.forEach(([fullName, sex], i) => {
    const year = 1952 + Math.floor(rnd() * 60);
    const p: Patient = {
      id: `h${String(i + 1).padStart(2, "0")}`,
      clinicId,
      hn: `HN${String(maxHn + 1 + i).padStart(6, "0")}`,
      fullName,
      birthDate: `${year}-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`,
      sex,
      phone: `08${Math.floor(rnd() * 10)}-${String(Math.floor(rnd() * 1000)).padStart(3, "0")}-${String(Math.floor(rnd() * 10000)).padStart(4, "0")}`,
      allergies: rnd() < 0.12 ? [pick(["Penicillin", "Aspirin", "Sulfa", "Ibuprofen"])] : [],
      medicalAlerts: rnd() < 0.18 ? [pick(["ความดันโลหิตสูง", "เบาหวาน", "โรคหัวใจ"])] : [],
      createdAt: at(addDays(today, -Math.floor(5 + rnd() * 150)), "10:00"),
    };
    db.patients.push(p);
  });

  // ---------- ประวัติ visit ย้อนหลัง 60 วัน ----------
  const GENERAL: [string, number][] = [["SCALE", 28], ["COMP1", 18], ["COMP2", 10], ["EXAM", 10], ["EXT", 9], ["RCTM", 7], ["SEAL", 5], ["FLUOR", 5], ["SURG", 4], ["CROWN", 4]];
  const weighted = (xs: [string, number][]) => {
    let r = rnd() * xs.reduce((s, x) => s + x[1], 0);
    for (const [k, w] of xs) if ((r -= w) < 0) return k;
    return xs[0][0];
  };
  const tooth = () => pick([1, 2, 3, 4]) * 10 + 1 + Math.floor(rnd() * 7);
  const CHAIR: Record<string, string> = { u1: "ch2", u2: "ch1", u5: "ch3" };
  const DUR: Record<string, number> = { SCALE: 45, COMP1: 45, COMP2: 60, EXAM: 30, EXT: 45, RCTM: 90, SEAL: 30, FLUOR: 30, SURG: 90, CROWN: 60, ORTHO: 30 };
  const methods: [PaymentMethod, number][] = [["cash", 38], ["transfer", 47], ["card", 15]];
  const crownItems: { inv: Invoice; item: InvoiceItem }[] = [];

  for (let back = 60; back >= 1; back--) {
    const date = addDays(today, -back);
    if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0) continue; // ปิดวันอาทิตย์
    const pool = db.patients.filter((p) => p.id.startsWith("h") || ["p2", "p4", "p5", "p8", "p9"].includes(p.id)).filter((p) => localDate(p.createdAt!) <= date);
    const slot: Record<string, number> = { u1: 0, u2: 0, u5: 0 };
    const n = 5 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const dentistId = weighted([["u2", 40], ["u1", 35], ["u5", 25]]);
      const code = dentistId === "u5" ? (rnd() < 0.85 ? "ORTHO" : "EXAM") : weighted(GENERAL);
      const start = 9 * 60 + slot[dentistId];
      if (start > 18 * 60) continue;
      slot[dentistId] += (DUR[code] ?? 30) + 15 + (slot[dentistId] < 180 && slot[dentistId] + 60 >= 180 ? 60 : 0);
      const p = pick(pool);
      const status = weighted([["done", 86], ["no_show", 8], ["cancelled", 6]]) as Appointment["status"];
      const pr = proc(code);
      const teeth = ["COMP1", "COMP2", "EXT", "RCTM", "CROWN", "SEAL"].includes(code) ? [tooth()] : code === "SURG" ? [pick([38, 48])] : [];
      const a: Appointment = {
        id: id(`hist:${date}:${k}`),
        clinicId,
        patientId: p.id,
        dentistId,
        chairId: CHAIR[dentistId],
        start: `${date}T${hhmm(start)}`,
        durationMin: DUR[code] ?? 30,
        procedure: teeth.length ? `${pr.name} ${teeth.join(", ")}` : pr.name,
        status,
        createdBy: "u3",
        createdAt: at(addDays(date, -7), "10:00"),
        updatedAt: at(date, hhmm(start)),
        ...(status === "done" ? { arrivedAt: at(date, hhmm(start - 10)), calledAt: at(date, hhmm(start)), finishedAt: at(date, hhmm(start + (DUR[code] ?? 30))) } : {}),
      };
      db.appointments.push(a);
      if (status !== "done") continue;

      const line = (c: string, t: number[]): InvoiceItem => {
        const x = proc(c);
        const discount = rnd() < 0.08 ? Math.round(x.price * 0.1) : 0;
        return { id: id(`it:${a.id}:${c}`), procedureId: x.id, name: x.name, teeth: t, qty: 1, unitPrice: x.price, discount, dentistId };
      };
      const lines = [line(code, teeth)];
      if (code === "EXAM" && rnd() < 0.4) lines.push(line("PANO", []));
      if (["RCTM", "EXT", "SURG"].includes(code)) lines.push(line("PA", teeth));
      if (code === "SCALE" && rnd() < 0.25) lines.push(line("FLUOR", []));
      const total = lines.reduce((s, l) => s + l.qty * l.unitPrice - l.discount, 0);
      const method = weighted(methods) as PaymentMethod;
      const paidAt = at(date, hhmm(start + (DUR[code] ?? 30) + 5));
      const inv: Invoice = {
        id: id(`hinv:${a.id}`),
        clinicId,
        patientId: p.id,
        kind: "service",
        appointmentId: a.id,
        status: "paid",
        items: lines,
        payments: [{ method, amount: total, ...(method === "cash" ? { received: Math.ceil(total / 10000) * 10000 } : method === "card" ? { ref: String(1000 + Math.floor(rnd() * 9000)) } : {}) }],
        total,
        paidAt,
        paidBy: "u3",
        createdBy: dentistId,
        createdAt: paidAt,
        updatedAt: paidAt,
      };
      db.invoices.push(inv);
      if (code === "CROWN") crownItems.push({ inv, item: lines[0] });
    }
  }

  // ---------- มัดจำ: p2 วางมัดจำผ่าฟันคุด (หลังคลอด) ----------
  const depAt = at(addDays(today, -3), "15:20");
  db.invoices.push({
    id: id("dep:p2"),
    clinicId,
    patientId: "p2",
    kind: "deposit",
    status: "paid",
    items: [{ id: id("dep:p2:item"), name: "รับมัดจำ — ผ่าฟันคุด 38 (หลังคลอด)", teeth: [], qty: 1, unitPrice: 2000_00, discount: 0 }],
    payments: [{ method: "transfer", amount: 2000_00, ref: "PromptPay 7731" }],
    total: 2000_00,
    paidAt: depAt,
    paidBy: "u3",
    createdBy: "u3",
    createdAt: depAt,
    updatedAt: depAt,
  });

  // ---------- แผนผ่อน ----------
  const planInvoice = (planId: string, patientId: string, dentistId: string, procedureId: string, title: string, no: number, count: number, amount: number, date: string) => {
    const paidAt = at(date, "11:10");
    db.invoices.push({
      id: id(`pinv:${planId}:${no}`),
      clinicId,
      patientId,
      kind: "installment",
      planId,
      installmentNo: no,
      status: "paid",
      items: [{ id: id(`pit:${planId}:${no}`), procedureId, name: no === 0 ? `${title} — เงินดาวน์` : `${title} — งวด ${no}/${count}`, teeth: [], qty: 1, unitPrice: amount, discount: 0, dentistId }],
      payments: [{ method: no % 2 ? "transfer" : "cash", amount, ...(no % 2 ? {} : { received: amount }) }],
      total: amount,
      paidAt,
      paidBy: "u3",
      createdBy: "u3",
      createdAt: paidAt,
      updatedAt: paidAt,
    });
  };
  // จัดฟัน p7: ดาวน์ + 3 งวดแล้ว งวดที่ 4 ครบกำหนดวันนี้
  const ortho = { id: "plan-p7", title: "จัดฟันแบบติดแน่น", total: 48000_00, down: 12000_00, count: 24, firstDue: addMonths(today, -3) };
  db.plans.push({
    id: ortho.id, clinicId, patientId: "p7", dentistId: "u5", procedureId: "pr-ortho", title: ortho.title, total: ortho.total, downPayment: ortho.down,
    count: ortho.count, firstDue: ortho.firstDue, status: "active", createdBy: "u3", createdAt: at(addMonths(today, -4), "10:00"),
  });
  const per = Math.floor((ortho.total - ortho.down) / ortho.count / 100) * 100;
  planInvoice(ortho.id, "p7", "u5", "pr-ortho", ortho.title, 0, ortho.count, ortho.down, addMonths(today, -4));
  for (let no = 1; no <= 3; no++) planInvoice(ortho.id, "p7", "u5", "pr-ortho", ortho.title, no, ortho.count, per, addMonths(ortho.firstDue, no - 1));
  // รากเทียม h05: งวด 1 จ่ายแล้ว งวด 2 ค้าง
  const impl = { id: "plan-h05", title: "รากฟันเทียม ซี่ 46", total: 45000_00, down: 15000_00, count: 6, firstDue: addDays(addMonths(today, -2), 3) };
  db.plans.push({
    id: impl.id, clinicId, patientId: "h05", dentistId: "u1", procedureId: "pr-impl", title: impl.title, total: impl.total, downPayment: impl.down,
    count: impl.count, firstDue: impl.firstDue, status: "active", createdBy: "u3", createdAt: at(addMonths(today, -2), "14:00"),
  });
  planInvoice(impl.id, "h05", "u1", "pr-impl", impl.title, 0, impl.count, impl.down, addMonths(today, -2));
  planInvoice(impl.id, "h05", "u1", "pr-impl", impl.title, 1, impl.count, (impl.total - impl.down) / impl.count, impl.firstDue);

  // ---------- กฎ DF ----------
  const ruleAt = at(addDays(today, -70), "09:00");
  db.dfRules = [
    { clinicId, dentistId: "u1", defaultPercent: 50, byCategory: {}, dailyMinimum: 0, updatedAt: ruleAt, updatedBy: "u1" },
    { clinicId, dentistId: "u2", defaultPercent: 40, byCategory: { "รักษารากฟัน": 45, "ทันตกรรมประดิษฐ์": 35 }, dailyMinimum: 1500_00, updatedAt: ruleAt, updatedBy: "u1" },
    { clinicId, dentistId: "u5", defaultPercent: 40, byCategory: { "จัดฟัน": 50 }, dailyMinimum: 1000_00, updatedAt: ruleAt, updatedBy: "u1" },
  ];

  // ---------- งานแล็บ ----------
  db.labs = [
    { id: "lab1", clinicId, name: "แล็บรุ่งเรืองทันตกรรม", phone: "02-000-1111" },
    { id: "lab2", clinicId, name: "Smile Ceramic Lab", phone: "02-000-2222" },
    { id: "lab3", clinicId, name: "Ortho Aligner Studio", phone: "02-000-3333" },
  ];
  const labCase = (k: string, c: Partial<Db["labCases"][number]> & Pick<Db["labCases"][number], "patientId" | "dentistId" | "labId" | "work" | "sentAt" | "dueDate" | "status" | "cost">) =>
    db.labCases.push({ id: id(`lab:${k}`), clinicId, teeth: [], createdBy: "u3", createdAt: at(c.sentAt, "16:00"), updatedAt: at(c.sentAt, "16:00"), ...c });
  crownItems.slice(-4).forEach(({ inv, item }, i) => {
    const sent = addDays(localDate(inv.paidAt!), -10);
    labCase(`crown${i}`, {
      patientId: inv.patientId, dentistId: item.dentistId!, labId: i % 2 ? "lab2" : "lab1", work: "ครอบฟันเซรามิก (PFM)", teeth: item.teeth, shade: "A2",
      sentAt: sent, dueDate: addDays(sent, 7), receivedAt: addDays(sent, 7), fittedAt: localDate(inv.paidAt!), status: "fitted", cost: 2500_00,
      invoiceId: inv.id, invoiceItemId: item.id,
    });
  });
  const p6Draft = db.invoices.find((i) => i.patientId === "p6" && i.status === "draft");
  labCase("p6", {
    patientId: "p6", dentistId: "u1", labId: "lab1", work: "ครอบฟันเซรามิก (PFM)", teeth: [26], shade: "A3", sentAt: addDays(today, -7), dueDate: addDays(today, 1),
    status: "sent", cost: 2500_00, invoiceId: p6Draft?.id, invoiceItemId: p6Draft?.items[0]?.id, note: "ลองครอบวันนี้ นัดยึดครอบพรุ่งนี้",
  });
  labCase("p1", { patientId: "p1", dentistId: "u2", labId: "lab2", work: "ครอบฟันเซรามิกล้วน (Emax)", teeth: [36], shade: "A2", sentAt: today, dueDate: addDays(today, 7), status: "sent", cost: 3800_00 });
  labCase("h12", { patientId: "h12", dentistId: "u1", labId: "lab1", work: "ฟันปลอมถอดได้ฐานอะคริลิก", teeth: [11, 12, 21], sentAt: addDays(today, -12), dueDate: addDays(today, -2), status: "sent", cost: 1800_00 });
  labCase("h20", {
    patientId: "h20", dentistId: "u2", labId: "lab2", work: "ครอบฟันเซรามิก (PFM)", teeth: [14], shade: "A3.5", sentAt: addDays(today, -9), dueDate: addDays(today, 2),
    status: "remake", cost: 2500_00, note: `ส่งแก้ ${addDays(today, -2)}: สีเข้มกว่าฟันข้างเคียง`,
  });
  labCase("p7", { patientId: "p7", dentistId: "u5", labId: "lab3", work: "รีเทนเนอร์ใส (บน-ล่าง)", sentAt: addDays(today, -6), dueDate: addDays(today, -1), receivedAt: addDays(today, -1), status: "received", cost: 1500_00 });

  // ---------- Local Bridge ----------
  db.bridges = [
    { id: "br1", clinicId, name: "ห้อง X-ray 1", device: "Vatech EzSensor (ฟิล์มในปาก)", tokenHash: sha256("demo-bridge-1"), lastSeenAt: new Date().toISOString(), version: "0.3.1", queue: 0 },
    { id: "br2", clinicId, name: "ห้อง Panoramic", device: "Carestream CS 8100", tokenHash: sha256("demo-bridge-2"), lastSeenAt: new Date(Date.now() - 3 * 3600_000).toISOString(), version: "0.3.0", queue: 2 },
  ];
  const file = (k: string, f: Partial<Db["bridgeFiles"][number]> & Pick<Db["bridgeFiles"][number], "bridgeId" | "fileName" | "modality" | "status">, minsAgo: number) => {
    const t = new Date(Date.now() - minsAgo * 60_000).toISOString();
    db.bridgeFiles.push({ id: id(`bf:${k}`), clinicId, receivedAt: t, updatedAt: t, attempts: f.status === "unmatched" ? 0 : 1, ...f });
  };
  file("s1", { bridgeId: "br1", fileName: "IO_20261127_0912.dcm", modality: "IO", status: "sent", patientId: "p4" }, 300);
  file("s2", { bridgeId: "br1", fileName: "IO_20261127_0915.dcm", modality: "IO", status: "sent", patientId: "p4" }, 297);
  file("s3", { bridgeId: "br1", fileName: "IO_20261127_1044.dcm", modality: "IO", status: "sent", patientId: "p3" }, 30);
  file("s4", { bridgeId: "br2", fileName: "PX_20261126_1530.dcm", modality: "PX", status: "sent", patientId: "p9" }, 1400);
  file("u1", { bridgeId: "br1", fileName: "IMG_0458.jpg", modality: "IO", status: "unmatched", patientHint: "ไม่มีข้อมูลคนไข้ในไฟล์" }, 20);
  file("u2", { bridgeId: "br2", fileName: "PX_20261127_0950.dcm", modality: "PX", status: "unmatched", patientHint: "NAPA J (ID: 129)" }, 210);
  file("u3", { bridgeId: "br1", fileName: "IO_20261127_1102.dcm", modality: "IO", status: "unmatched", patientHint: "KAMON S" }, 8);
  file("f1", { bridgeId: "br2", fileName: "PX_20261127_1015.dcm", modality: "PX", status: "failed", patientId: "p5", error: "STOW-RS 503 Service Unavailable (PACS ไม่ตอบ)" }, 190);

  // ---------- เลขใบเสร็จ (ต่อเดือน เรียงตามเวลารับชำระ) + ปิดยอดของวันที่ผ่านมา ----------
  const counters = new Map<string, number>();
  for (const inv of db.invoices.filter((i) => i.status === "paid").sort((a, b) => a.paidAt!.localeCompare(b.paidAt!))) {
    const d = localDate(inv.paidAt!);
    const prefix = `RC${String(Number(d.slice(0, 4)) + 543).slice(2)}${d.slice(5, 7)}-`;
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    inv.receiptNo = `${prefix}${String(n).padStart(4, "0")}`;
  }
  const byDate = new Map<string, Invoice[]>();
  for (const inv of db.invoices) {
    if (!inv.paidAt) continue;
    const d = localDate(inv.paidAt);
    if (d >= today) continue;
    byDate.set(d, [...(byDate.get(d) ?? []), inv]);
  }
  for (const [d, list] of [...byDate].sort()) {
    const byMethod = { cash: 0, transfer: 0, card: 0, deposit: 0 };
    for (const i of list) for (const p of i.payments) byMethod[p.method] += p.amount;
    const short = rnd() < 0.1 ? -2000 : 0;
    const c = {
      id: id(`close:${d}`),
      clinicId,
      closedAt: at(d, "19:30"),
      closedBy: "u3",
      receiptCount: list.length,
      voidCount: 0,
      total: byMethod.cash + byMethod.transfer + byMethod.card,
      byMethod,
      float: 2000_00,
      cashCounted: 2000_00 + byMethod.cash + short,
      diff: short,
      note: short ? "ทอนเงินเกิน 20 บาท" : undefined,
    };
    db.closes.push(c);
    for (const i of list) i.closeId = c.id;
  }
}
