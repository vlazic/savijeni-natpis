import { readFileSync } from "node:fs";
import { parse } from "opentype.js";
import { describe, expect, it } from "vitest";
import { WARP0, bboxOf, simplify, toD, warpAll, warpedText, type Contour } from "./geometry";
import { DEFAULTS, displayText, sanitize } from "./settings";
import { buildSVG, missingChars } from "./svg";

const buf = readFileSync(new URL("../public/fonts/Anton-Regular.ttf", import.meta.url));
const anton = parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

const square: Contour = [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10], [0, 10], [0, 5]];

describe("simplify", () => {
  it("drops collinear points and keeps the corners of a ring", () => {
    expect(simplify(square, 0.15)).toEqual([[0, 0], [10, 0], [10, 10], [0, 10], [0, 5]]);
  });
  it("keeps a corner that lies past the end of the chord", () => {
    expect(simplify([[0, 0], [10, 0], [12, 0], [11, 0]], 0.15)).toEqual([[0, 0], [12, 0], [11, 0]]);
  });
  it("produces path data for a closed contour", () => {
    expect(toD([square])).toBe("M0 0L10 0 10 10 0 10 0 5Z");
  });
});

describe("warp", () => {
  it("leaves points alone with the neutral warp", () => {
    const b = bboxOf([square]);
    expect(warpAll([square], b, WARP0)).toEqual([square]);
  });

  it("makes the middle of the block shorter than the ends with positive pinch", () => {
    const out = warpedText(anton, "IIIII", DEFAULTS, { ...WARP0, pinch: 0.3 })!;
    const heights = out.contours.map((c) => bboxOf([c]).h);
    expect(heights[2]).toBeLessThan(heights[0] * 0.85);
    expect(heights[4]).toBeCloseTo(heights[0], 0);
  });
});

describe("buildSVG", () => {
  it("returns null for empty text", () => {
    expect(buildSVG(anton, { ...DEFAULTS, text: " \n " })).toBeNull();
  });

  it("builds a well-formed SVG with every effect on", () => {
    const s = { ...DEFAULTS, text: "ŠUMA\nđak", gradOn: true, strokeOn: true, shadowOn: true, extrudeOn: true, bgOn: true, rotate: 10, wave: 0.1 };
    const r = buildSVG(anton, s)!;
    expect(r.svg).not.toMatch(/NaN|Infinity|undefined/);
    expect(r.svg).toMatch(/^<svg [^>]*viewBox="[-\d. ]+"/);
    for (const part of ['<path id="nt"', 'id="ng"', 'id="nb"', "<rect ", "translate("]) expect(r.svg).toContain(part);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  });

  it("escapes markup in the title", () => {
    expect(buildSVG(anton, { ...DEFAULTS, text: "A<B&C" })!.svg).toContain("<title>A&lt;B&amp;C</title>");
  });
});

describe("missingChars", () => {
  it("lists characters the font cannot draw, once each", () => {
    expect(missingChars(anton, "ŠđЖЖ x")).toEqual(["Ж"]);
  });
});

describe("settings from storage", () => {
  it("keeps valid values, clamps numbers and drops anything that could break the SVG markup", () => {
    const s = sanitize({ fill: 'red"/><image href=x onerror=alert(1) "', bgColor: "#00ff00", pngWidth: 1e9, pinch: "0.5",
      align: "justify", ground: "dark", text: "OK", strokeOn: true, extra: 1 });
    expect(s.fill).toBe(DEFAULTS.fill);
    expect(s.bgColor).toBe("#00ff00");
    expect(s.pngWidth).toBe(8000);
    expect(s.pinch).toBe(DEFAULTS.pinch);
    expect(s.align).toBe(DEFAULTS.align);
    expect(s.ground).toBe("dark");
    expect(s.text).toBe("OK");
    expect(s.strokeOn).toBe(true);
    expect("extra" in s).toBe(false);
  });
  it("returns defaults for junk", () => {
    expect(sanitize("x")).toEqual(DEFAULTS);
  });
});

describe("displayText", () => {
  it("turns tabs into spaces, drops XML-illegal characters and composes accents", () => {
    expect(displayText({ ...DEFAULTS, text: "A\tB\u000Cc\u0001\nS\u030C" })).toBe("A B c\nŠ");
  });
});
