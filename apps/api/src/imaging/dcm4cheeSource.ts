import crypto from "node:crypto";
import { config } from "../config.js";
import { parseMeta, renderThumbnail } from "./dicom.js";
import { ReadOnlyError, type ImageSource, type InstanceMeta } from "./types.js";

type DicomJson = Record<string, { vr: string; Value?: unknown[] }>;

const INCLUDE = ["00080020", "0008103E", "00080060", "00280010", "00280011", "00100020"].join(",");

/**
 * เชื่อม dcm4chee-arc ผ่าน DICOMweb
 *  - QIDO-RS  : ค้นหา instance ตาม PatientID
 *  - WADO-URI : ดึงไฟล์ Part 10 ทั้งไฟล์ (ใช้กับ wadouri loader ของ Cornerstone)
 *  - WADO-RS rendered : thumbnail
 *  - STOW-RS  : อัปโหลด
 * dcm4chee ต้องไม่เปิดสู่ภายนอก ทุกคำขอผ่าน API นี้ซึ่งตรวจสิทธิ์และบันทึก audit
 */
export class Dcm4cheeSource implements ImageSource {
  readonly name = "dcm4chee";
  readonly readOnly = config.dcm4chee.readOnly;
  private kcToken: { value: string; exp: number } | null = null;
  private metaCache = new Map<string, InstanceMeta>();

  async authHeaders(): Promise<Record<string, string>> {
    const { token, kc } = config.dcm4chee;
    if (token) return { Authorization: `Bearer ${token}` };
    if (!kc.tokenUrl) return {};
    if (!this.kcToken || this.kcToken.exp < Date.now() + 30_000) {
      const res = await fetch(kc.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: kc.clientId,
          client_secret: kc.clientSecret,
        }),
      });
      if (!res.ok) throw new Error(`Keycloak token error ${res.status}`);
      const j = (await res.json()) as { access_token: string; expires_in: number };
      this.kcToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    }
    return { Authorization: `Bearer ${this.kcToken.value}` };
  }

  private async get(url: string, accept: string) {
    const res = await fetch(url, { headers: { Accept: accept, ...(await this.authHeaders()) } });
    if (!res.ok && res.status !== 204) throw new Error(`dcm4chee ${res.status} ${url}`);
    return res;
  }

  private toMeta(o: DicomJson): InstanceMeta {
    const v = (tag: string) => (o[tag]?.Value?.[0] ?? "") as string | number;
    return {
      studyInstanceUid: String(v("0020000D")),
      seriesInstanceUid: String(v("0020000E")),
      sopInstanceUid: String(v("00080018")),
      patientId: String(v("00100020")),
      modality: String(v("00080060")),
      studyDate: String(v("00080020")),
      seriesDescription: String(v("0008103E")),
      rows: Number(v("00280010")) || 0,
      columns: Number(v("00280011")) || 0,
    };
  }

  private async qido(params: Record<string, string>) {
    const qs = new URLSearchParams({ ...params, includefield: INCLUDE });
    const res = await this.get(`${config.dcm4chee.rsUrl}/instances?${qs}`, "application/dicom+json");
    if (res.status === 204) return [];
    const list = ((await res.json()) as DicomJson[]).map((o) => this.toMeta(o));
    for (const m of list) this.metaCache.set(m.sopInstanceUid, m);
    return list;
  }

  listByPatient(pid: string) {
    return this.qido({ PatientID: pid });
  }

  async find(sop: string) {
    return this.metaCache.get(sop) ?? (await this.qido({ SOPInstanceUID: sop }))[0] ?? null;
  }

  async retrieve(m: InstanceMeta) {
    const qs = new URLSearchParams({
      requestType: "WADO",
      studyUID: m.studyInstanceUid,
      seriesUID: m.seriesInstanceUid,
      objectUID: m.sopInstanceUid,
      contentType: "application/dicom",
      transferSyntax: "*",
    });
    const res = await this.get(`${config.dcm4chee.wadoUrl}?${qs}`, "application/dicom");
    return Buffer.from(await res.arrayBuffer());
  }

  async thumbnail(m: InstanceMeta) {
    try {
      const { rsUrl } = config.dcm4chee;
      const url = `${rsUrl}/studies/${m.studyInstanceUid}/series/${m.seriesInstanceUid}/instances/${m.sopInstanceUid}/rendered?viewport=256,256`;
      const res = await this.get(url, "image/jpeg");
      return { contentType: "image/jpeg", body: Buffer.from(await res.arrayBuffer()) };
    } catch {
      const png = renderThumbnail(await this.retrieve(m));
      return png ? { contentType: "image/png", body: png } : null;
    }
  }

  async store(buf: Buffer) {
    if (this.readOnly) throw new ReadOnlyError();
    const meta = parseMeta(buf);
    const boundary = `dbdente-${crypto.randomUUID()}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/dicom\r\n\r\n`),
      buf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await fetch(`${config.dcm4chee.rsUrl}/studies`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; type="application/dicom"; boundary=${boundary}`,
        Accept: "application/dicom+json",
        ...(await this.authHeaders()),
      },
      body,
    });
    if (!res.ok) throw new Error(`STOW-RS failed ${res.status}: ${await res.text()}`);
    this.metaCache.set(meta.sopInstanceUid, meta);
    return meta;
  }
}
