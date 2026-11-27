/** วันที่แบบไทย เช่น 12 พ.ค. 2569 — รับ YYYY-MM-DD, YYYYMMDD หรือ ISO */
export function thaiDate(d: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  const iso = /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  // toLocaleString (ไม่ใช่ toLocaleDateString) เพื่อรองรับตัวเลือกเวลา เช่น timeStyle, hour
  return Number.isNaN(date.getTime()) ? d : date.toLocaleString("th-TH", opts);
}

/** วันนี้ตามเวลาไทย YYYY-MM-DD (ตรงกับ visitDate ที่ API ใช้) */
export const todayTH = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
