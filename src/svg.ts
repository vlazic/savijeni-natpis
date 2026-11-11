// Builds the final SVG string from a font and the state. Pure, so tests can run it in Node.
import type { Font } from "opentype.js";
import { r1, toD, warpedText, type BBox } from "./geometry";
import { displayText, type State } from "./settings";

export interface SvgResult { svg: string; w: number; h: number }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** Characters the font has no glyph for (whitespace ignored). */
export function missingChars(font: Font, text: string): string[] {
  return [...new Set([...text].filter((ch) => !/\s/.test(ch) && font.charToGlyphIndex(ch) === 0))];
}

/** Settings that change the outline. Anything else (colors, effects, padding) reuses the cached path. */
const SHAPE_KEYS = ["text", "upper", "tracking", "hscale", "lineHeight", "align", "kerning",
  "pinch", "fan", "arch", "persp", "wave", "waveFreq", "wavePhase", "slant", "rotate"] as const;

let cache: { font: Font; key: string; shape: { d: string; b: BBox } | null } | null = null;

/** The warped outline as path data, recomputed only when the font or a shape setting changed. */
function shapeOf(font: Font, s: State) {
  const key = JSON.stringify(SHAPE_KEYS.map((k) => s[k]));
  if (cache?.font !== font || cache.key !== key) {
    const warped = warpedText(font, displayText(s), s, s);
    cache = { font, key, shape: warped && { d: toD(warped.contours, warped.eps), b: warped.bbox } };
  }
  return cache.shape;
}

export function buildSVG(font: Font, s: State): SvgResult | null {
  const shape = shapeOf(font, s);
  if (!shape) return null;
  const { d, b } = shape;
  const text = displayText(s);

  // Canvas bounds: glyphs, plus stroke, 3D side and shadow, plus padding.
  let L = b.x0, T = b.y0, R = b.x1, B = b.y1;
  const grow = (dx: number, dy: number, extra = 0) => {
    L = Math.min(L, b.x0 + dx - extra); R = Math.max(R, b.x1 + dx + extra);
    T = Math.min(T, b.y0 + dy - extra); B = Math.max(B, b.y1 + dy + extra);
  };
  // Half the stroke sticks out; a miter tip can reach miterlimit (4) halves, so 2 widths.
  const sw = s.strokeOn ? s.strokeWidth * (s.strokeJoin === "miter" ? 2 : 0.5) : 0;
  grow(0, 0, sw);
  const ea = s.extrudeAngle * Math.PI / 180, depth = s.extrudeOn ? s.extrudeDepth : 0;
  const ex = Math.cos(ea) * depth, ey = Math.sin(ea) * depth;
  grow(ex, ey, sw);
  if (s.shadowOn) {
    const blur = sw + s.shadowBlur * 3;
    grow(s.shadowX, s.shadowY, blur);
    grow(s.shadowX + ex, s.shadowY + ey, blur);
  }
  L -= s.padding; T -= s.padding; R += s.padding; B += s.padding;
  const vw = R - L, vh = B - T;

  // `href` for current browsers, `xlink:href` for Illustrator and older tools.
  const use = (attrs = "") => `<use href="#nt" xlink:href="#nt"${attrs}/>`;
  const strokeAttrs = (color: string) => s.strokeOn
    ? ` stroke="${color}" stroke-width="${s.strokeWidth}" stroke-linejoin="${s.strokeJoin}" stroke-miterlimit="4"` : "";
  const defs = [`<path id="nt" d="${d}"/>`];
  // 3D side: copies of the outline stepped along the extrude direction, back to front. Defined
  // once and referenced by both the 3D layer and the shadow; it takes the fill of whoever uses it.
  if (s.extrudeOn) {
    // Fine enough that the stepped side does not show as a sawtooth in a large PNG.
    const n = Math.min(240, Math.max(1, Math.ceil(depth / 0.3)));
    let copies = "";
    for (let i = n; i >= 1; i--) copies += use(` transform="translate(${r1(ex * i / n)} ${r1(ey * i / n)})"`);
    defs.push(`<g id="ne">${copies}</g>`);
  }
  const extrude = s.extrudeOn ? `<use href="#ne" xlink:href="#ne"/>` : "";
  let fill = s.fill;
  if (s.gradOn) {
    // In user space, so the angle is the real angle whatever the text's proportions; the
    // gradient line spans the glyph bbox projected on that direction.
    const ga = s.gradAngle * Math.PI / 180, c = Math.cos(ga), sn = Math.sin(ga);
    const half = (Math.abs(c) * b.w + Math.abs(sn) * b.h) / 2, mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
    defs.push(`<linearGradient id="ng" gradientUnits="userSpaceOnUse" x1="${r1(mx - c * half)}" y1="${r1(my - sn * half)}" x2="${r1(mx + c * half)}" y2="${r1(my + sn * half)}">` +
      `<stop offset="0" stop-color="${s.fill}"/><stop offset="1" stop-color="${s.fill2}"/></linearGradient>`);
    fill = "url(#ng)";
  }

  const body: string[] = [];
  if (s.bgOn) body.push(`<rect x="${r1(L)}" y="${r1(T)}" width="${r1(vw)}" height="${r1(vh)}" fill="${s.bgColor}"/>`);
  if (s.shadowOn) {
    // Region = the whole canvas, which already has room for the blur; a bbox-relative region
    // clips large blurs on small text.
    if (s.shadowBlur > 0) defs.push(`<filter id="nb" filterUnits="userSpaceOnUse" x="${r1(L)}" y="${r1(T)}" width="${r1(vw)}" height="${r1(vh)}"><feGaussianBlur stdDeviation="${s.shadowBlur}"/></filter>`);
    body.push(`<g fill="${s.shadowColor}" opacity="${s.shadowOpacity}"${strokeAttrs(s.shadowColor)}${s.shadowBlur > 0 ? ' filter="url(#nb)"' : ""}>` +
      `<g transform="translate(${s.shadowX} ${s.shadowY})">${extrude}${use()}</g></g>`);
  }
  if (s.extrudeOn) body.push(`<g fill="${s.extrudeColor}"${strokeAttrs(s.extrudeColor)}>${extrude}</g>`);
  if (s.strokeOn && s.strokePos === "behind") {
    // Two layers instead of paint-order, which Illustrator ignores.
    body.push(use(` fill="${s.strokeColor}"${strokeAttrs(s.strokeColor)}`));
    body.push(use(` fill="${fill}"`));
  } else {
    body.push(use(` fill="${fill}"${strokeAttrs(s.strokeColor)}`));
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.ceil(vw)}" height="${Math.ceil(vh)}" viewBox="${r1(L)} ${r1(T)} ${r1(vw)} ${r1(vh)}">` +
    `<title>${esc(text.replace(/\n/g, " "))}</title><defs>${defs.join("")}</defs>${body.join("")}</svg>`;
  return { svg, w: vw, h: vh };
}
