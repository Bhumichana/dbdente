// ระบบเลขฟัน FDI — แถวตามมุมมองทันตแพทย์ (ขวาคนไข้อยู่ซ้ายจอ)
export const PERMANENT = {
  upper: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  lower: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
};

export const PRIMARY = {
  upper: [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
  lower: [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
};

export const quadrant = (t: number) => Math.floor(t / 10);
export const isUpper = (t: number) => [1, 2, 5, 6].includes(quadrant(t));
/** ควอดแรนต์ขวาของคนไข้ (แสดงฝั่งซ้ายจอ) → ด้าน Mesial อยู่ทางขวาของรูป */
export const mesialOnRight = (t: number) => [1, 4, 5, 8].includes(quadrant(t));

export const SURFACE_LABEL = {
  M: "Mesial",
  O: "Occlusal/Incisal",
  D: "Distal",
  B: "Buccal/Labial",
  L: "Lingual/Palatal",
} as const;

export const STATUS_STYLE = {
  existing: { fill: "#64748b", label: "ฟันเดิม (Existing)" },
  planned: { fill: "#dc2626", label: "แผนการรักษา (Planned)" },
  completed: { fill: "#1d6fe0", label: "ทำเสร็จแล้ว (Completed)" },
} as const;
