/**
 * สร้างภาพ X-ray ฟันแบบสังเคราะห์ (ไม่ใช่ภาพคนไข้จริง) สำหรับเดโม
 * ค่า pixel 12-bit (0–4095) MONOCHROME2: ความหนาแน่นสูง = ขาว
 */

export interface Img {
  w: number;
  h: number;
  px: Float32Array;
}

const V = { air: 250, soft: 650, bone: 1150, dentin: 2300, enamel: 3100, pulp: 1050, gp: 3900, crown: 4050 };

export function blank(w: number, h: number, value = V.soft): Img {
  return { w, h, px: new Float32Array(w * h).fill(value) };
}

/** สุ่มแบบกำหนด seed ได้ เพื่อให้ภาพเหมือนเดิมทุกครั้งที่ seed */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** กระดูกเบ้าฟัน (trabecular) ในบริเวณที่ inBone(x,y) เป็นจริง */
export function bone(img: Img, inBone: (x: number, y: number) => number, seed: number) {
  const r = rng(seed);
  const waves = Array.from({ length: 9 }, () => ({
    fx: 0.02 + r() * 0.12,
    fy: 0.02 + r() * 0.12,
    p: r() * Math.PI * 2,
  }));
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const k = inBone(x, y);
      if (k <= 0) continue;
      let t = 0;
      for (const w of waves) t += Math.sin(x * w.fx + y * w.fy + w.p);
      const v = V.bone + t * 45;
      const i = y * img.w + x;
      img.px[i] = img.px[i] * (1 - k) + v * k;
    }
  }
}

export interface RootSpec {
  dx: number; // ตำแหน่งรากเทียบกึ่งกลางฟัน (px)
  width: number;
  tilt: number; // ปลายรากเอียงไปทาง u กี่ px
}

export interface ToothSpec {
  cx: number;
  top: number; // y ของปลายครอบฟัน (ด้านบดเคี้ยว/ปลายฟัน)
  crownW: number;
  crownH: number;
  rootLen: number;
  roots: RootSpec[];
  up?: boolean; // ฟันบน (รากชี้ขึ้น)
  angle?: number; // องศาเอียงของทั้งซี่
  rct?: boolean; // อุดคลองรากแล้ว (gutta-percha)
  crown?: boolean; // ครอบฟัน
  filling?: "O" | "M" | "D" | "MO" | "DO";
  caries?: "M" | "D";
  lesion?: number; // รัศมีรอยโรคปลายราก (px)
}

const superEllipse = (u: number, v: number, a: number, b: number, n = 4) =>
  Math.pow(Math.abs(u) / a, n) + Math.pow(Math.abs(v) / b, n);

export function tooth(img: Img, t: ToothSpec) {
  const ang = ((t.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const sgn = t.up ? -1 : 1;
  const total = t.crownH * 0.8 + t.rootLen + 20;
  const reach = Math.max(t.crownW, total) + 40;
  const x0 = Math.max(0, Math.floor(t.cx - reach));
  const x1 = Math.min(img.w - 1, Math.ceil(t.cx + reach));
  const y0 = Math.max(0, Math.floor(Math.min(t.top, t.top + sgn * total) - 40));
  const y1 = Math.min(img.h - 1, Math.ceil(Math.max(t.top, t.top + sgn * total) + 40));
  const halfW = t.crownW / 2;
  const halfH = t.crownH / 2;
  const rootTop = t.crownH * 0.78;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // พิกัดภายในฟัน: u แนวนอน, v วัดจากปลายครอบลงไปทางราก
      const dx = x - t.cx;
      const dy = (y - t.top) * sgn;
      const u = dx * cos + dy * sin * sgn;
      const v = -dx * sin * sgn + dy * cos;
      const i = y * img.w + x;
      let val: number | null = null;

      // ---- ราก ----
      let inRoot = false;
      let inCanal = false;
      let nearRoot = Infinity;
      for (const r of t.roots) {
        const tt = (v - rootTop) / t.rootLen;
        if (tt < -0.05 || tt > 1.15) continue;
        const tc = Math.min(Math.max(tt, 0), 1);
        const c = r.dx + r.tilt * tc;
        const hw = (r.width / 2) * (1 - 0.72 * tc);
        let d: number;
        if (tt <= 1) d = Math.abs(u - c) - hw;
        else d = Math.hypot(u - c, (tt - 1) * t.rootLen) - hw;
        nearRoot = Math.min(nearRoot, d);
        if (d <= 0) {
          inRoot = true;
          const cw = Math.max(1.6, hw * 0.17) * (t.rct ? 1.7 : 1);
          if (tt >= -0.05 && tt <= 0.97 && Math.abs(u - c) <= cw) inCanal = true;
        }
      }

      // ---- ครอบฟัน ----
      const vc = v - halfH;
      const crownE = superEllipse(u, vc, halfW, halfH);
      const inCrown = crownE <= 1 && v >= 0;

      if (inRoot || inCrown) {
        val = V.dentin;
        if (inCrown && v < t.crownH * 0.7 && superEllipse(u, vc - halfH * 0.12, halfW * 0.84, halfH * 0.86) > 1) val = V.enamel;
        // โพรงประสาทฟัน
        const chamber = superEllipse(u, v - t.crownH * 0.72, halfW * 0.3, t.crownH * 0.13, 2.4) <= 1;
        if (chamber) val = t.rct ? V.gp : V.pulp;
        if (inCanal) val = t.rct ? V.gp : V.pulp;
        if (t.caries && inCrown) {
          const side = t.caries === "M" ? -1 : 1;
          if (Math.hypot(u - side * halfW * 0.72, v - t.crownH * 0.35) < t.crownW * 0.17) val = V.pulp - 150;
        }
        if (t.filling && inCrown) {
          const f = t.filling;
          const occ = f.includes("O") && v < t.crownH * 0.42 && Math.abs(u) < halfW * 0.45;
          const mes = f.includes("M") && u < -halfW * 0.35 && v < t.crownH * 0.55;
          const dis = f.includes("D") && u > halfW * 0.35 && v < t.crownH * 0.55;
          if (occ || mes || dis) val = V.crown;
        }
        if (t.crown && inCrown && v < t.crownH * 0.75) val = V.crown;
      } else if (nearRoot < 4) {
        img.px[i] -= 260; // ช่อง PDL
      } else if (nearRoot < 8) {
        img.px[i] += 220; // lamina dura
      }

      // ---- รอยโรคปลายราก ----
      if (t.lesion && !inRoot) {
        for (const r of t.roots.slice(0, 1)) {
          const au = r.dx + r.tilt;
          const av = rootTop + t.rootLen + t.lesion * 0.4;
          const d = Math.hypot(u - au, v - av);
          if (d < t.lesion) img.px[i] -= 650 * (1 - (d / t.lesion) ** 2);
        }
      }

      if (val !== null) img.px[i] = val;
    }
  }
}

export function finish(img: Img, seed: number, blurPasses = 2): Uint16Array {
  let a = img.px;
  for (let p = 0; p < blurPasses; p++) {
    const b = new Float32Array(a.length);
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        let s = 0;
        let n = 0;
        for (let k = -1; k <= 1; k++) {
          for (let l = -1; l <= 1; l++) {
            const yy = y + k;
            const xx = x + l;
            if (yy < 0 || xx < 0 || yy >= img.h || xx >= img.w) continue;
            s += a[yy * img.w + xx];
            n++;
          }
        }
        b[y * img.w + x] = s / n;
      }
    }
    a = b;
  }
  const r = rng(seed);
  const out = new Uint16Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = Math.max(0, Math.min(4095, Math.round(a[i] + (r() - 0.5) * 90)));
  return out;
}

// ---------------- ภาพสำเร็จรูป ----------------

/** PA ฟันกรามล่างซ้าย 36 (ขนาด 600x800 px, 0.04 mm/px ≈ เซนเซอร์ size 1) */
export function pa36(stage: "before" | "after"): { w: number; h: number; data: Uint16Array } {
  const img = blank(600, 800);
  bone(img, (_x, y) => Math.min(1, Math.max(0, (y - 230) / 40)), 36);
  const molarRoots = (w: number): RootSpec[] => [
    { dx: -w * 0.26, width: w * 0.3, tilt: -10 },
    { dx: w * 0.26, width: w * 0.3, tilt: 14 },
  ];
  // 35 (บางส่วนด้านซ้าย) / 36 / 37 (บางส่วนด้านขวา)
  tooth(img, { cx: 30, top: 95, crownW: 190, crownH: 230, rootLen: 360, roots: [{ dx: 0, width: 70, tilt: 4 }] });
  tooth(img, {
    cx: 300,
    top: 70,
    crownW: 270,
    crownH: 230,
    rootLen: 330,
    roots: molarRoots(270),
    angle: -2,
    caries: stage === "before" ? "M" : undefined,
    lesion: stage === "before" ? 62 : 26,
    rct: stage === "after",
    crown: stage === "after",
  });
  tooth(img, { cx: 585, top: 85, crownW: 250, crownH: 220, rootLen: 300, roots: molarRoots(250), angle: 4, filling: "O" });
  return { w: img.w, h: img.h, data: finish(img, stage === "before" ? 11 : 12) };
}

/** PA ฟันหน้าบน 11 */
export function pa11(): { w: number; h: number; data: Uint16Array } {
  const img = blank(600, 800);
  bone(img, (_x, y) => Math.min(1, Math.max(0, (560 - y) / 40)), 11);
  tooth(img, { cx: 300, top: 740, crownW: 210, crownH: 270, rootLen: 380, roots: [{ dx: 0, width: 95, tilt: -6 }], up: true });
  tooth(img, { cx: 40, top: 730, crownW: 190, crownH: 260, rootLen: 360, roots: [{ dx: 0, width: 85, tilt: 6 }], up: true, angle: 4 });
  tooth(img, { cx: 560, top: 720, crownW: 160, crownH: 240, rootLen: 330, roots: [{ dx: 0, width: 75, tilt: -6 }], up: true, angle: -5, filling: "M" });
  return { w: img.w, h: img.h, data: finish(img, 111) };
}

/** Bitewing ด้านขวา (ฟัน 14–16 / 44–46) */
export function bitewingRight(): { w: number; h: number; data: Uint16Array } {
  const img = blank(820, 620);
  bone(img, (_x, y) => (y < 150 || y > 470 ? 1 : y < 190 ? (190 - y) / 40 : y > 430 ? (y - 430) / 40 : 0), 7);
  const occl = 310;
  const up = [
    { cx: 120, w: 170, f: undefined },
    { cx: 320, w: 180, f: "DO" as const },
    { cx: 570, w: 270, f: undefined },
  ];
  const low = [
    { cx: 110, w: 160, f: undefined },
    { cx: 310, w: 175, f: undefined },
    { cx: 560, w: 270, f: "O" as const },
  ];
  for (const t of up) {
    tooth(img, { cx: t.cx, top: occl - 12, crownW: t.w, crownH: 200, rootLen: 260, roots: [{ dx: 0, width: t.w * 0.4, tilt: 0 }], up: true, filling: t.f });
  }
  for (const t of low) {
    tooth(img, { cx: t.cx, top: occl + 12, crownW: t.w, crownH: 200, rootLen: 260, roots: [{ dx: 0, width: t.w * 0.4, tilt: 0 }], filling: t.f, caries: t.cx === 310 ? "D" : undefined });
  }
  return { w: img.w, h: img.h, data: finish(img, 77) };
}

/** Panoramic (1600x800 px, 0.1 mm/px) — missing = เลข FDI ที่ไม่มีฟัน */
export function panoramic(opts: { missing?: number[]; rct?: number[]; crowns?: number[]; fillings?: number[] }) {
  const img = blank(1600, 800, V.air);
  const occl = (x: number) => 400 + 0.00016 * (x - 800) ** 2 * 1.0;
  // ขากรรไกรบน / ล่าง
  bone(img, (x, y) => {
    const o = occl(x);
    const upper = y < o - 30 && y > o - 320 + Math.abs(x - 800) * 0.05 ? 1 : 0;
    const lower = y > o + 30 && y < 760 - 0.00012 * (x - 800) ** 2 ? 1 : 0;
    return Math.max(upper, lower) * (x > 80 && x < 1520 ? 1 : 0);
  }, 99);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.px[y * img.w + x] === V.air) img.px[y * img.w + x] = V.soft - 200;

  const widths = [56, 50, 58, 54, 54, 92, 88, 80]; // ตำแหน่ง 1..8
  const rootLens = [150, 140, 190, 160, 160, 150, 140, 120];
  const crownHs = [100, 95, 105, 90, 90, 85, 85, 80];
  const draw = (quad: number) => {
    const upper = quad === 1 || quad === 2;
    const dir = quad === 1 || quad === 4 ? -1 : 1; // ฝั่งขวาคนไข้ = ซ้ายของภาพ
    let x = 800;
    for (let n = 1; n <= 8; n++) {
      const w = widths[n - 1];
      const cx = x + dir * w / 2;
      x += dir * (w + 4);
      const fdi = quad * 10 + n;
      if (opts.missing?.includes(fdi)) continue;
      const tilt = (cx - 800) * 0.012;
      const o = occl(cx);
      const molar = n >= 6;
      tooth(img, {
        cx,
        top: upper ? o - 6 : o + 6,
        crownW: w - 4,
        crownH: crownHs[n - 1],
        rootLen: rootLens[n - 1],
        up: upper,
        angle: tilt * (upper ? -1 : 1),
        roots: molar
          ? [
              { dx: -w * 0.22, width: w * 0.3, tilt: -4 },
              { dx: w * 0.22, width: w * 0.3, tilt: 6 },
            ]
          : [{ dx: 0, width: w * 0.42, tilt: 0 }],
        rct: opts.rct?.includes(fdi),
        crown: opts.crowns?.includes(fdi),
        filling: opts.fillings?.includes(fdi) ? "O" : undefined,
      });
    }
  };
  [1, 2, 3, 4].forEach(draw);
  return { w: img.w, h: img.h, data: finish(img, 5, 1) };
}
