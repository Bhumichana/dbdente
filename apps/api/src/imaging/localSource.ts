import fs from "node:fs";
import path from "node:path";
import { parseMeta, renderThumbnail } from "./dicom.js";
import type { ImageSource, InstanceMeta } from "./types.js";

/** เก็บไฟล์ DICOM ในโฟลเดอร์ — สำหรับเดโม/พัฒนาโดยไม่ต้องต่อ PACS */
export class LocalSource implements ImageSource {
  readonly name = "local";
  private index = new Map<string, InstanceMeta>();

  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".dcm")) continue;
      try {
        const meta = parseMeta(fs.readFileSync(path.join(dir, f)));
        this.index.set(meta.sopInstanceUid, meta);
      } catch {
        /* ข้ามไฟล์เสีย */
      }
    }
  }

  private file(sop: string) {
    return path.join(this.dir, `${sop}.dcm`);
  }

  async listByPatient(pid: string) {
    return [...this.index.values()].filter((m) => m.patientId === pid);
  }
  async find(sop: string) {
    return this.index.get(sop) ?? null;
  }
  async retrieve(meta: InstanceMeta) {
    return fs.promises.readFile(this.file(meta.sopInstanceUid));
  }
  async thumbnail(meta: InstanceMeta) {
    const png = renderThumbnail(await this.retrieve(meta));
    return png ? { contentType: "image/png", body: png } : null;
  }
  async store(buf: Buffer) {
    const meta = parseMeta(buf);
    await fs.promises.writeFile(this.file(meta.sopInstanceUid), buf);
    this.index.set(meta.sopInstanceUid, meta);
    return meta;
  }
}
