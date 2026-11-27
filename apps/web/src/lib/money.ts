/** จำนวนเงินในระบบเป็นสตางค์ (จำนวนเต็ม) */

/** 123456 → "1,234.56" */
export const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ข้อความที่พิมพ์ → สตางค์ ("1,234.5" → 123450) · ว่าง/ผิดรูปแบบ → null */
export function parseBaht(text: string): number | null {
  const t = text.replace(/[,\s฿]/g, "");
  if (!t) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return null;
  const [i, d = ""] = t.split(".");
  return Number(i) * 100 + Number(d.padEnd(2, "0"));
}

/** สตางค์ → ค่าในช่องกรอก ("1234.50" ไม่มีจุลภาค) */
export const toInput = (satang: number) => (satang % 100 ? (satang / 100).toFixed(2) : String(satang / 100));

const DIGIT = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACE = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function readInt(n: number): string {
  if (n === 0) return "";
  if (n >= 1_000_000) return readInt(Math.floor(n / 1_000_000)) + "ล้าน" + readInt(n % 1_000_000);
  const s = String(n);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    const pos = s.length - i - 1;
    if (d === 0) continue;
    if (pos === 1 && d === 1) out += "สิบ";
    else if (pos === 1 && d === 2) out += "ยี่สิบ";
    else if (pos === 0 && d === 1 && s.length > 1) out += "เอ็ด";
    else out += DIGIT[d] + PLACE[pos];
  }
  return out;
}

/** จำนวนเงินเป็นตัวอักษรบนใบเสร็จ เช่น 1250050 → "หนึ่งหมื่นสองพันห้าร้อยบาทห้าสิบสตางค์" */
export function bahtText(satang: number) {
  const b = Math.floor(satang / 100);
  const s = satang % 100;
  if (b === 0 && s === 0) return "ศูนย์บาทถ้วน";
  return (b ? readInt(b) + "บาท" : "") + (s ? readInt(s) + "สตางค์" : "ถ้วน");
}
