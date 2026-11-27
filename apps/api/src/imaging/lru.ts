/** LRU cache จำกัดขนาดเป็นไบต์ เก็บไฟล์ DICOM ที่เปิดบ่อย ช่วยให้โหลดภาพได้ < 1.5 วินาที */
export class ByteLru {
  private map = new Map<string, Buffer>();
  private size = 0;

  constructor(private maxBytes: number) {}

  get(key: string) {
    const v = this.map.get(key);
    if (v) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  set(key: string, v: Buffer) {
    if (v.byteLength > this.maxBytes) return;
    const old = this.map.get(key);
    if (old) {
      this.size -= old.byteLength;
      this.map.delete(key);
    }
    this.map.set(key, v);
    this.size += v.byteLength;
    for (const [k, b] of this.map) {
      if (this.size <= this.maxBytes) break;
      this.map.delete(k);
      this.size -= b.byteLength;
    }
  }
}
