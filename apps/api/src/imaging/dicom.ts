import dcmjs from "dcmjs";
import dicomParser from "dicom-parser";
import { PNG } from "pngjs";
import type { InstanceMeta } from "./types.js";

const u8 = (buf: Buffer) => new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

export function parseMeta(buf: Buffer): InstanceMeta {
  const ds = dicomParser.parseDicom(u8(buf), { untilTag: "x7fe00010" });
  const s = (tag: string) => (ds.string(tag) ?? "").trim();
  const meta: InstanceMeta = {
    studyInstanceUid: s("x0020000d"),
    seriesInstanceUid: s("x0020000e"),
    sopInstanceUid: s("x00080018"),
    patientId: s("x00100020"),
    modality: s("x00080060"),
    studyDate: s("x00080020"),
    seriesDescription: s("x0008103e"),
    rows: ds.uint16("x00280010") ?? 0,
    columns: ds.uint16("x00280011") ?? 0,
  };
  if (!meta.studyInstanceUid || !meta.seriesInstanceUid || !meta.sopInstanceUid) {
    throw new Error("ไฟล์ไม่ใช่ DICOM ที่สมบูรณ์ (ไม่มี Study/Series/SOP Instance UID)");
  }
  return meta;
}

/**
 * ผูกไฟล์ DICOM เข้ากับคนไข้ในระบบ: เขียนทับ PatientID / PatientName / IssuerOfPatientID
 * (ระยะถัดไป Local Bridge จะทำขั้นตอนนี้ที่คลินิกก่อนส่งขึ้น Cloud)
 */
export function assignPatient(
  buf: Buffer,
  p: { patientId: string; name: string; issuer: string; birthDate: string; sex: string },
): Buffer {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const dict = dcmjs.data.DicomMessage.readFile(ab);
  dict.dict["00080005"] = { vr: "CS", Value: ["ISO_IR 192"] };
  dict.dict["00100020"] = { vr: "LO", Value: [p.patientId] };
  dict.dict["00100010"] = { vr: "PN", Value: [{ Alphabetic: p.name }] };
  dict.dict["00100021"] = { vr: "LO", Value: [p.issuer] };
  dict.dict["00100030"] = { vr: "DA", Value: [p.birthDate.replaceAll("-", "")] };
  dict.dict["00100040"] = { vr: "CS", Value: [p.sex] };
  return Buffer.from(dict.write());
}

const UNCOMPRESSED = new Set(["1.2.840.10008.1.2", "1.2.840.10008.1.2.1", "1.2.840.10008.1.2.2"]);

/** สร้าง thumbnail PNG จากไฟล์ที่ไม่บีบอัด (ไฟล์บีบอัดให้ PACS render แทน) */
export function renderThumbnail(buf: Buffer, maxSize = 256): Buffer | null {
  const ds = dicomParser.parseDicom(u8(buf));
  const ts = (ds.string("x00020010") ?? "").trim();
  const px = ds.elements.x7fe00010;
  if (!UNCOMPRESSED.has(ts) || !px || px.encapsulatedPixelData) return null;
  if ((ds.uint16("x00280002") ?? 1) !== 1) return null; // เฉพาะภาพขาวดำ

  const rows: number = ds.uint16("x00280010") ?? 0;
  const cols: number = ds.uint16("x00280011") ?? 0;
  const bits = ds.uint16("x00280100") ?? 16;
  const signed = ds.uint16("x00280103") === 1;
  const mono1 = (ds.string("x00280004") ?? "").trim() === "MONOCHROME1";
  const start = buf.byteOffset + px.dataOffset;
  const n = rows * cols;
  const raw = buf.buffer.slice(start, start + n * (bits === 8 ? 1 : 2));
  const data = bits === 8 ? new Uint8Array(raw) : signed ? new Int16Array(raw) : new Uint16Array(raw);

  let lo: number, hi: number;
  const wc = parseFloat(ds.string("x00281050") ?? "");
  const ww = parseFloat(ds.string("x00281051") ?? "");
  if (Number.isFinite(wc) && Number.isFinite(ww) && ww > 0) {
    lo = wc - ww / 2;
    hi = wc + ww / 2;
  } else {
    lo = Infinity;
    hi = -Infinity;
    for (let i = 0; i < n; i += 7) {
      const v = data[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const scale = Math.min(1, maxSize / Math.max(rows, cols));
  const w = Math.max(1, Math.round(cols * scale));
  const h = Math.max(1, Math.round(rows * scale));
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    const sy = Math.min(rows - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(cols - 1, Math.floor(x / scale));
      let g = Math.round(((data[sy * cols + sx] - lo) / (hi - lo || 1)) * 255);
      g = Math.max(0, Math.min(255, g));
      if (mono1) g = 255 - g;
      const o = (y * w + x) * 4;
      png.data[o] = png.data[o + 1] = png.data[o + 2] = g;
      png.data[o + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}
