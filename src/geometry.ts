// Pure geometry: text layout from font outlines, curve flattening, envelope warp, simplification.
// No DOM access here, so everything is unit-testable.
import type { Font } from "opentype.js";

/** Internal font size in SVG user units. Stroke widths, offsets and padding are in the same units. */
const FS = 200;

type Pt = [number, number];
export type Contour = Pt[];
export type Align = "left" | "center" | "right";

interface Cmd {
  type: "M" | "L" | "Q" | "C" | "Z";
  x?: number; y?: number;
  x1?: number; y1?: number;
  x2?: number; y2?: number;
}

export interface LayoutOpts {
  tracking: number;   // extra space between letters, in em
  hscale: number;     // horizontal scale of every glyph
  lineHeight: number; // in em
  align: Align;
  kerning: boolean;
}

export interface Warp {
  pinch: number;     // + squeezes the middle (the reference photo), - bulges it
  fan: number;       // + leans the outer letters outward
  arch: number;      // + lifts the middle
  persp: number;     // + grows the right end
  wave: number;      // amplitude, in block heights
  waveFreq: number;  // waves across the block
  wavePhase: number; // degrees
  slant: number;
  rotate: number;    // degrees
}

export const WARP0: Warp = { pinch: 0, fan: 0, arch: 0, persp: 0, wave: 0, waveFreq: 1, wavePhase: 0, slant: 0, rotate: 0 };

export interface BBox { x0: number; y0: number; x1: number; y1: number; w: number; h: number }

/** Lays out multi-line text and returns absolute path commands in user units. */
function layout(font: Font, text: string, o: LayoutOpts): Cmd[] {
  const sc = FS / font.unitsPerEm;
  const lines = text.split("\n").map((line, li) => {
    const glyphs = font.stringToGlyphs(line);
    const placed: [typeof glyphs[number], number][] = [];
    let pen = 0;
    glyphs.forEach((g, i) => {
      placed.push([g, pen]);
      pen += (g.advanceWidth || 0) * sc * o.hscale + o.tracking * FS;
      if (o.kerning && i < glyphs.length - 1) pen += font.getKerningValue(g, glyphs[i + 1]) * sc * o.hscale;
    });
    const w = glyphs.length ? pen - o.tracking * FS : 0;
    return { placed, w, y: li * FS * o.lineHeight };
  });
  const maxW = Math.max(0, ...lines.map((l) => l.w));
  const cmds: Cmd[] = [];
  for (const l of lines) {
    const off = o.align === "center" ? (maxW - l.w) / 2 : o.align === "right" ? maxW - l.w : 0;
    for (const [g, pen] of l.placed) {
      const x0 = off + pen;
      for (const c of g.getPath(0, 0, FS).commands) {
        const src = c as Cmd;
        const t: Cmd = { type: src.type };
        if (src.x !== undefined) { t.x = x0 + src.x * o.hscale; t.y = l.y + src.y!; }
        if (src.x1 !== undefined) { t.x1 = x0 + src.x1 * o.hscale; t.y1 = l.y + src.y1!; }
        if (src.x2 !== undefined) { t.x2 = x0 + src.x2 * o.hscale; t.y2 = l.y + src.y2!; }
        cmds.push(t);
      }
    }
  }
  return cmds;
}

/**
 * Turns commands into dense closed rings (last point not repeated). Straight lines are subdivided
 * too, so the warp can bend them; `step` is the target segment length.
 */
function flatten(cmds: Cmd[], step: number): Contour[] {
  const out: Contour[] = [];
  let cur: Contour | null = null;
  let sx = 0, sy = 0, cx = 0, cy = 0;
  const push = (x: number, y: number) => { cur!.push([x, y]); cx = x; cy = y; };
  const line = (x: number, y: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x - cx, y - cy) / step));
    const x0 = cx, y0 = cy;
    for (let i = 1; i <= n; i++) push(x0 + (x - x0) * i / n, y0 + (y - y0) * i / n);
  };
  const end = () => {
    if (cur && cur.length > 1) {
      const [fx, fy] = cur[0], [lx, ly] = cur[cur.length - 1];
      if (Math.abs(fx - lx) < 1e-6 && Math.abs(fy - ly) < 1e-6) cur.pop();
    }
    if (cur && cur.length > 2) out.push(cur);
    cur = null;
  };
  for (const c of cmds) {
    if (c.type === "M") { end(); cur = []; sx = c.x!; sy = c.y!; push(sx, sy); continue; }
    if (!cur) { cur = []; push(cx, cy); }
    if (c.type === "L") line(c.x!, c.y!);
    else if (c.type === "Q") {
      const len = Math.hypot(c.x1! - cx, c.y1! - cy) + Math.hypot(c.x! - c.x1!, c.y! - c.y1!);
      const n = Math.min(80, Math.max(2, Math.ceil(len / step))), x0 = cx, y0 = cy;
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        push(u * u * x0 + 2 * u * t * c.x1! + t * t * c.x!, u * u * y0 + 2 * u * t * c.y1! + t * t * c.y!);
      }
    } else if (c.type === "C") {
      const len = Math.hypot(c.x1! - cx, c.y1! - cy) + Math.hypot(c.x2! - c.x1!, c.y2! - c.y1!) + Math.hypot(c.x! - c.x2!, c.y! - c.y2!);
      const n = Math.min(100, Math.max(2, Math.ceil(len / step))), x0 = cx, y0 = cy;
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
        push(a * x0 + b * c.x1! + d * c.x2! + e * c.x!, a * y0 + b * c.y1! + d * c.y2! + e * c.y!);
      }
    } else if (c.type === "Z") {
      if (Math.hypot(sx - cx, sy - cy) > 1e-6) line(sx, sy);
      end();
    }
  }
  end();
  return out;
}

export function bboxOf(contours: Contour[]): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of contours) for (const [x, y] of c) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** Envelope warp over the block bbox `b`: u runs 0..1 across, the center line stays put. */
export function warpAll(contours: Contour[], b: BBox, w: Warp): Contour[] {
  const W = b.w || 1, H = b.h || 1, cy = (b.y0 + b.y1) / 2, cxm = (b.x0 + b.x1) / 2;
  const rot = w.rotate * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot);
  const ph = w.wavePhase * Math.PI / 180;
  return contours.map((c) => c.map(([x, y]): Pt => {
    const u = (x - b.x0) / W, k = 2 * u - 1, bell = 1 - k * k;
    const s = (1 - w.pinch * bell) * (1 + w.persp * k);
    let ys = cy + (y - cy) * s;
    let xs = x + (w.fan * k + w.slant) * (cy - ys);
    ys += -w.arch * H * bell + w.wave * H * Math.sin(2 * Math.PI * w.waveFreq * u + ph);
    if (rot) {
      const dx = xs - cxm, dy = ys - cy;
      xs = cxm + dx * cr - dy * sr;
      ys = cy + dx * sr + dy * cr;
    }
    return [xs, ys];
  }));
}

/** Distance from p to the segment a-z (not the infinite line), so a zero-length segment is fine. */
function segDist([px, py]: Pt, ax: number, ay: number, zx: number, zy: number): number {
  const dx = zx - ax, dy = zy - ay, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Ramer-Douglas-Peucker; keeps the SVG small after dense sampling. */
export function simplify(pts: Contour, eps: number): Contour {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, z] = stack.pop()!;
    const [ax, ay] = pts[a], [zx, zy] = pts[z];
    let best = -1, bi = -1;
    for (let i = a + 1; i < z; i++) {
      const d = segDist(pts[i], ax, ay, zx, zy);
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) { keep[bi] = 1; stack.push([a, bi], [bi, z]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Rounds to one decimal, for offsets and sizes. */
export const r1 = (v: number): string => {
  const s = (Math.round(v * 10) / 10).toString();
  return s === "-0" ? "0" : s;
};

/** Rounds to two decimals, for path points (short text can be scaled up 80 times for a PNG). */
const r2 = (v: number): string => {
  const s = (Math.round(v * 100) / 100).toString();
  return s === "-0" ? "0" : s;
};

/** Path data; `eps` is the simplification tolerance in user units. */
export function toD(contours: Contour[], eps = 0.15): string {
  let d = "";
  for (const c of contours) {
    const pts = simplify(c, eps);
    if (pts.length < 3) continue;
    d += "M" + r2(pts[0][0]) + " " + r2(pts[0][1]) + "L" + pts.slice(1).map(([x, y]) => r2(x) + " " + r2(y)).join(" ") + "Z";
  }
  return d;
}

/**
 * Lays out, flattens and warps the text. The sampling step and the simplify tolerance (`eps`,
 * for toD) follow the block size: the PNG is exported at a fixed pixel width, so a short word is
 * scaled up much more than a long one and needs finer geometry. Pass `step` to override (the
 * preset thumbnails use a coarse one).
 */
export function warpedText(font: Font, text: string, o: LayoutOpts, w: Warp, step?: number): { contours: Contour[]; bbox: BBox; eps: number } | null {
  const cmds = layout(font, text, o);
  const coarse = flatten(cmds, 4);
  if (!coarse.length) return null;
  const b0 = bboxOf(coarse);
  const st = step ?? Math.max(0.05, Math.min(FS / 160, Math.max(b0.w, b0.h) / 1500));
  const contours = warpAll(flatten(cmds, st), b0, w);
  return { contours, bbox: bboxOf(contours), eps: st * 0.12 };
}
