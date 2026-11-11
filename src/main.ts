import "./style.css";
import type { Font } from "opentype.js";
import { initControls, showFontTile, syncUI } from "./controls";
import { $ } from "./dom";
import { copySvg, fileBase, flash, makePng, offer, pngSize } from "./export";
import { FONTS, FontFileError, findFont, loadCustomFont, loadFont } from "./fonts";
import { WARP0, toD, warpedText } from "./geometry";
import { DEFAULTS, PRESETS, displayText } from "./settings";
import { store } from "./state";
import { buildSVG, missingChars, type SvgResult } from "./svg";

const stage = $("stage"), info = $("info"), missing = $("missing");
const copybox = $<HTMLTextAreaElement>("copybox");

// An uploaded font is not kept across reloads, and a bundled one may be renamed: fall back.
if (!findFont(store.s.font)) store.s.font = DEFAULTS.font;

let current: SvgResult | null = null;
let raf = 0;
/** Batches every store change in a frame into one control sync and one render. */
const schedule = () => { raf ||= requestAnimationFrame(() => { raf = 0; syncUI(); render(); }); };

function showEmpty(msg: string) {
  current = null;
  missing.hidden = true;
  stage.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: msg }));
  info.textContent = "";
}

function render() {
  const s = store.s;
  const f = findFont(s.font) ?? FONTS[0];
  const font = f.font;
  if (!font) {
    // Not parsed yet: render again once it is, from whatever the settings are by then. Clear the
    // stage meanwhile so nothing downloads the previous font's drawing.
    showEmpty(`Učitavam font ${f.name}…`);
    loadFont(f).then(schedule, () => {
      if (store.s.font === f.id) showEmpty(`Font ${f.name} nije učitan. Izaberi drugi font ili učitaj svoj.`);
    });
    return;
  }

  const miss = missingChars(font, displayText(s));
  missing.hidden = !miss.length;
  if (miss.length) missing.textContent = `${f.name} nema znakove: ${miss.join(" ")}. Izaberi drugi font.`;

  let res: SvgResult | null;
  try {
    res = buildSVG(font, s);
  } catch (e) {
    console.error(e);
    showEmpty("Ovaj tekst nije moguće nacrtati ovim fontom.");
    return;
  }
  if (!res) { showEmpty("Upiši tekst iznad da se pojavi natpis."); return; }

  if (res.svg !== current?.svg) {
    stage.innerHTML = res.svg;
    if (!copybox.hidden) copybox.value = res.svg;
  }
  current = res;
  const png = pngSize(res, s.pngWidth);
  info.textContent = `SVG ${Math.ceil(res.w)} × ${Math.ceil(res.h)}, ${(res.svg.length / 1024).toFixed(0)} KB. PNG ${png.w} × ${png.h} px`;
}

/** Draws "ABC" through each preset's warp for the preset buttons. */
function presetThumbs(font: Font) {
  for (const p of PRESETS) {
    const out = warpedText(font, "ABC", { ...DEFAULTS, tracking: 0.04 }, { ...WARP0, ...p.w }, 5);
    const svg = document.querySelector(`#presets button[data-p="${p.id}"] svg`);
    if (!out || !svg) continue;
    const b = out.bbox, m = b.h * 0.08;
    svg.setAttribute("viewBox", `${b.x0 - m} ${b.y0 - m} ${b.w + 2 * m} ${b.h + 2 * m}`);
    svg.innerHTML = `<path d="${toD(out.contours, 0.5)}"/>`;
  }
}

$("fontFile").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const entry = await loadCustomFont(file);
    showFontTile(entry);
    store.set("font", entry.id);
    flash(`Font ${entry.name} je učitan.`);
  } catch (err) {
    flash(err instanceof FontFileError ? err.message : String(err), true);
  }
  input.value = "";
});

const filename = (ext: string) => fileBase(displayText(store.s)) + ext;
$("dlSvg").addEventListener("click", () => { if (current) void offer(filename(".svg"), current.svg); });
$<HTMLButtonElement>("dlPng").addEventListener("click", async (e) => {
  if (!current) return;
  const btn = e.currentTarget as HTMLButtonElement;
  btn.disabled = true;
  try {
    await offer(filename(".png"), await makePng(current, store.s.pngWidth));
  } catch {
    flash("PNG nije napravljen. Smanji širinu PNG-a pa pokušaj ponovo.", true);
  } finally {
    btn.disabled = false;
  }
});
$("copySvg").addEventListener("click", () => { if (current) copySvg(current.svg, copybox); });

initControls();
store.subscribe(schedule);
schedule();
const anton = findFont("anton")!;
loadFont(anton).then(presetThumbs).catch(() => {});
// Warm the other fonts so the picker previews and switching are instant.
setTimeout(() => FONTS.forEach((f) => { if (f.file) loadFont(f).catch(() => {}); }), 400);
