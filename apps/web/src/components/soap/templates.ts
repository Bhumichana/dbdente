/**
 * เทมเพลต SOAP ตามหัตถการที่พบบ่อย — เติมเฉพาะช่องที่ยังว่าง ไม่ทับสิ่งที่พิมพ์ไว้
 * {t} จะถูกแทนด้วยเลขซี่ที่เลือก
 */
export interface SoapTemplate {
  key: string;
  label: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export const SOAP_TEMPLATES: SoapTemplate[] = [
  {
    key: "exam",
    label: "ตรวจสุขภาพช่องปาก",
    subjective: "มาตรวจสุขภาพช่องปาก ไม่มีอาการปวด",
    objective: "เหงือก: \nฟันผุ: \nหินปูน: ",
    assessment: "",
    plan: "ขูดหินปูน / ขัดฟัน · นัดตรวจครั้งถัดไป 6 เดือน",
  },
  {
    key: "rct",
    label: "รักษารากฟัน (RCT)",
    subjective: "ปวดฟันซี่ {t} ",
    objective: "{t}: เคาะเจ็บ ( ) · Cold test ( ) · PA: ",
    assessment: "Irreversible pulpitis {t}",
    plan: "RCT {t} ครั้งที่ 1: เปิดโพรงประสาทฟัน ทำความสะอาดคลองราก · WL = mm · ใส่ยา Ca(OH)₂",
  },
  {
    key: "filling",
    label: "อุดฟัน",
    subjective: "เสียวฟันซี่ {t} เวลาทานของเย็น",
    objective: "{t}: ผุด้าน ",
    assessment: "Dental caries {t}",
    plan: "อุด Composite {t} ด้าน  · Shade ",
  },
  {
    key: "extraction",
    label: "ถอนฟัน",
    subjective: "ต้องการถอนฟันซี่ {t}",
    objective: "{t}: โยก ( ) · PA: ",
    assessment: "",
    plan: "ถอนฟัน {t} ใต้ยาชาเฉพาะที่ · Lidocaine 2% 1 cartridge · ให้คำแนะนำหลังถอน",
  },
  {
    key: "scaling",
    label: "ขูดหินปูน",
    subjective: "มาขูดหินปูนตามนัด",
    objective: "หินปูนเหนือเหงือก ( ) · ใต้เหงือก ( ) · เลือดออกขณะโพรบ ( )",
    assessment: "Gingivitis",
    plan: "ขูดหินปูนทั้งปาก ขัดฟัน · สอนแปรงฟันและใช้ไหมขัดฟัน",
  },
];

/** ข้อความสั้นที่ใช้บ่อย แตะเพื่อต่อท้ายช่องที่กำลังพิมพ์ */
export const QUICK_PHRASES = ["เคาะไม่เจ็บ", "เหงือกปกติ", "ไม่มีอาการปวด", "ให้คำแนะนำหลังทำ", "นัดติดตามผล 2 สัปดาห์"];
