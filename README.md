# DBDente — Phase 0 Demo

ระบบบริหารคลินิกทันตกรรม + Integrated Web DICOM Viewer (เดโมสำหรับ Customer Discovery)

**Flow หลักที่เดโมนี้พิสูจน์:** แตะซี่ฟันบน Tooth Chart → กรองฟิล์มของซี่นั้น → เปิดฟิล์มล่าสุดใน Viewer ทันที →
ปรับแสง / Invert / วัดความยาวราก (mm) → เทียบก่อน-หลังการรักษา 1x2 — บนเบราว์เซอร์และ iPad

```
apps/
  api/   Node.js (Express 5 + TypeScript) — Auth/RBAC, Audit Log, proxy ไป dcm4chee (DICOMweb)
  web/   Next.js 16 (App Router) + Tailwind 4 + Zustand + Cornerstone3D 5
```

## เริ่มใช้งาน

```bash
npm run setup     # ติดตั้ง dependency ทั้งหมด + สร้างข้อมูลเดโม
npm run dev       # API :4000 + Web :3000
```

เปิด http://localhost:3000 แล้วเลือกผู้ใช้ตามบทบาท (เดโมไม่มีรหัสผ่าน)

- **ทันตแพทย์:** เปิดคนไข้ "สมชาย ใจดี" → แตะซี่ **36** → จะเห็น PA ก่อน/หลังรักษาราก → ติ๊ก 2 ภาพแล้วกด "เทียบ 1x2"
- **เคาน์เตอร์:** เข้าหน้าคนไข้ได้ แต่ไม่เห็นผังฟันและฟิล์ม (RBAC)
- **เจ้าของคลินิก:** ดูเมนู Audit Log

**เปิดจาก iPad:** ให้ iPad อยู่ใน Wi-Fi เดียวกัน แล้วเปิด `http://<IP เครื่อง>:3000` ได้เลย
เว็บจะเรียก API ที่ hostname เดียวกัน พอร์ต 4000 ให้เอง

ไฟล์ DICOM ตัวอย่างสำหรับทดสอบปุ่มอัปโหลดอยู่ที่ `apps/api/data/samples/`
ภาพทั้งหมดเป็นภาพสังเคราะห์และคนไข้เป็นข้อมูลสมมติ

## เชื่อมต่อ dcm4chee

แก้ไฟล์ `apps/api/.env`:

```ini
IMAGE_SOURCE=dcm4chee
DCM4CHEE_RS_URL=http://<host>:8080/dcm4chee-arc/aets/<AET>/rs
# ถ้าเปิด security: ใช้ DCM4CHEE_TOKEN หรือ DCM4CHEE_KC_* (client credentials)
```

จากนั้นรัน `npm run seed` เพื่อส่งภาพเดโมเข้า dcm4chee ผ่าน STOW-RS แล้วรัน `npm run dev`

| การทำงาน | DICOMweb ที่ใช้ |
|---|---|
| รายการฟิล์มของคนไข้ | QIDO-RS `/instances?PatientID=` |
| เปิดภาพใน Viewer | WADO-URI `/wado?requestType=WADO&contentType=application/dicom&transferSyntax=*` |
| Thumbnail | WADO-RS `/rendered` (ถ้าใช้ไม่ได้จะ render จากไฟล์เอง) |
| อัปโหลด | STOW-RS `/studies` |

หลักการด้านความปลอดภัย:
- **ห้ามเปิด dcm4chee สู่ภายนอก** Browser คุยกับ API เท่านั้น และ API จะตรวจ JWT, บทบาท และ `clinic_id` ทุกคำขอ
- **PatientID รูปแบบ `{clinic_code}-{HN}`** และ IssuerOfPatientID = clinic code กัน HN ชนกันข้ามคลินิก ตอนอัปโหลด API เขียนทับค่าเหล่านี้ให้เอง
- **ตรวจว่า SOP Instance เป็นของคนไข้รายนั้นจริง** ก่อนส่งไฟล์ (กันการเดา UID) และปฏิเสธการอัปโหลด UID ซ้ำที่เป็นของคนไข้อื่น
- **Audit Log:** เปิดดูประวัติ / เปิดดูฟิล์ม / อัปโหลด / แก้ไขผังฟัน / ผูกฟิล์ม

## สิ่งที่ตั้งใจยังไม่ทำในระยะ 0

- **ข้อมูล:** เก็บเป็น JSON file (`apps/api/data/db.json`) ระยะ 1 จะย้ายไป PostgreSQL + Prisma
- **Login:** ยังเป็นการเลือกผู้ใช้ ยังไม่มีรหัสผ่าน / MFA
- **การวัดบนฟิล์ม:** ยังไม่บันทึกลงฐานข้อมูล (Dicom_Annotations)
- **อัปโหลด:** รับเฉพาะไฟล์ `.dcm` (JPG/TIFF → DICOM Secondary Capture จะทำใน Local Bridge)
- **ยังไม่มี:** นัดหมาย/คิว, การเงิน/DF, SOAP note, E-Consent, Smart Card
- **ค่าระยะที่วัดได้ขึ้น "Proj":** Cornerstone คำนวณจาก Imager Pixel Spacing (ที่ระดับเซนเซอร์ ยังไม่ชดเชยการขยายภาพ) ซึ่งเป็นพฤติกรรมปกติของภาพ X-ray แบบฉาย
