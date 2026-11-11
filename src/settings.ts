// Settings shape, presets and defaults. Pure (no DOM, no storage), so svg.ts and tests can import it.
import { WARP0, type LayoutOpts, type Warp } from "./geometry";

export interface State extends LayoutOpts, Warp {
  text: string;
  upper: boolean;
  font: string;
  fill: string; gradOn: boolean; fill2: string; gradAngle: number;
  strokeOn: boolean; strokeColor: string; strokeWidth: number; strokeJoin: "round" | "miter"; strokePos: "behind" | "front";
  shadowOn: boolean; shadowColor: string; shadowOpacity: number; shadowX: number; shadowY: number; shadowBlur: number;
  extrudeOn: boolean; extrudeColor: string; extrudeDepth: number; extrudeAngle: number;
  bgOn: boolean; bgColor: string; padding: number; pngWidth: number;
  ground: "auto" | "light" | "dark";
}

interface Preset { id: string; name: string; w: Partial<Warp>; extra?: Partial<State> }

/** The look of the reference photo: tall ends, squeezed middle, letters leaning outward. */
const PHOTO: Preset = { id: "photo", name: "Kao na slici", w: { pinch: 0.3, fan: 0.13 }, extra: { font: "anton", fill: "#d7261e" } };

export const PRESETS: Preset[] = [
  { id: "flat", name: "Ravno", w: {} },
  PHOTO,
  { id: "arch", name: "Luk", w: { arch: 0.2, fan: 0.22 } },
  { id: "valley", name: "Udolina", w: { arch: -0.2, fan: -0.22 } },
  { id: "bulge", name: "Ispupčenje", w: { pinch: -0.35, fan: -0.1 } },
  { id: "persp", name: "Perspektiva", w: { persp: 0.4 } },
  { id: "wave", name: "Talas", w: { wave: 0.12, waveFreq: 1 } },
  { id: "flag", name: "Zastava", w: { wave: 0.07, waveFreq: 1.5, wavePhase: 90, slant: 0.12 } },
];

export const DEFAULTS: State = {
  text: "TIGHTEN", upper: false, font: "anton",
  tracking: 0.02, hscale: 1, lineHeight: 1.05, align: "center", kerning: true,
  ...WARP0,
  fill: "#d7261e", gradOn: false, fill2: "#7e0d08", gradAngle: 90,
  strokeOn: false, strokeColor: "#ffffff", strokeWidth: 10, strokeJoin: "round", strokePos: "behind",
  shadowOn: false, shadowColor: "#000000", shadowOpacity: 0.35, shadowX: 6, shadowY: 10, shadowBlur: 6,
  extrudeOn: false, extrudeColor: "#7e0d08", extrudeDepth: 18, extrudeAngle: 60,
  bgOn: false, bgColor: "#ffffff", padding: 24, pngWidth: 2400, ground: "auto",
  ...PHOTO.w, ...PHOTO.extra,
};

export type NumKey = { [K in keyof State]: State[K] extends number ? K : never }[keyof State];
export type BoolKey = { [K in keyof State]: State[K] extends boolean ? K : never }[keyof State];

/** [min, max, step] of every number setting; the sliders and stored-value checks both use it. */
export const LIMITS: Record<NumKey, [number, number, number]> = {
  tracking: [-0.1, 0.5, 0.005], hscale: [0.5, 1.6, 0.01], lineHeight: [0.6, 2, 0.01],
  pinch: [-0.8, 0.8, 0.01], fan: [-0.5, 0.5, 0.01], arch: [-0.5, 0.5, 0.01], persp: [-0.8, 0.8, 0.01],
  wave: [0, 0.4, 0.005], waveFreq: [0.25, 4, 0.05], wavePhase: [0, 360, 1], slant: [-0.6, 0.6, 0.01], rotate: [-45, 45, 0.5],
  gradAngle: [0, 360, 1], strokeWidth: [1, 50, 0.5],
  shadowOpacity: [0, 1, 0.01], shadowX: [-80, 80, 1], shadowY: [-80, 80, 1], shadowBlur: [0, 40, 0.5],
  extrudeDepth: [1, 80, 1], extrudeAngle: [0, 360, 1], padding: [0, 200, 1], pngWidth: [200, 8000, 10],
};

export const COLOR_KEYS = ["fill", "fill2", "strokeColor", "shadowColor", "extrudeColor", "bgColor"] as const;

const ENUMS: Partial<Record<keyof State, readonly string[]>> = {
  align: ["left", "center", "right"], strokeJoin: ["round", "miter"], strokePos: ["behind", "front"], ground: ["auto", "light", "dark"],
};

export const clamp = (k: NumKey, v: number) => Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], v));
export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/**
 * Settings from an untrusted object (localStorage, which every page on the same origin can write).
 * Values end up in SVG attributes, so only well-formed ones are kept; the rest stay at their defaults.
 */
export function sanitize(raw: unknown): State {
  const s: State = { ...DEFAULTS };
  if (!raw || typeof raw !== "object") return s;
  const src = raw as Record<string, unknown>, out = s as unknown as Record<string, unknown>;
  for (const k of Object.keys(DEFAULTS) as (keyof State)[]) {
    const v = src[k];
    if (typeof v !== typeof DEFAULTS[k]) continue;
    if (k in LIMITS) { if (Number.isFinite(v)) out[k] = clamp(k as NumKey, v as number); }
    else if ((COLOR_KEYS as readonly string[]).includes(k)) { if (isHex(v as string)) out[k] = v; }
    else if (ENUMS[k]) { if (ENUMS[k].includes(v as string)) out[k] = v; }
    else out[k] = v; // text, font id, switches: used only as text or looked up
  }
  return s;
}

/**
 * The text as drawn: uppercased if asked, composed (NFC), other whitespace turned into spaces (a
 * font's tab glyph is usually its missing-glyph box) and characters XML forbids removed.
 */
export const displayText = (s: State) => (s.upper ? s.text.toLocaleUpperCase("sr") : s.text)
  .normalize("NFC")
  .replace(/[^\S\n]/g, " ")
  .replace(/[\u0000-\u0008\u000E-\u001F\uFFFE\uFFFF]/g, "");
