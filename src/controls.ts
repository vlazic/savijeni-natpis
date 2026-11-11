// Panel controls: built from declarative tables. Handlers only write to the store; syncUI()
// (run after every store change, see main.ts) brings every control back in line with it.
import { $ } from "./dom";
import { FONTS, type FontEntry } from "./fonts";
import { WARP0 } from "./geometry";
import { COLOR_KEYS, DEFAULTS, LIMITS, PRESETS, clamp, isHex, type BoolKey, type NumKey, type State } from "./settings";
import { store } from "./state";

/** [key, label, unit?, hint?]; ranges come from LIMITS. */
type RowDef = [NumKey, string, string?, string?];

/** Slider rows, keyed by the id of the container they go into in index.html. */
const ROWS: Record<string, RowDef[]> = {
  rowsText: [
    ["tracking", "Razmak slova", "em"],
    ["hscale", "Širina slova"],
    ["lineHeight", "Prored"],
  ],
  rowsWarp: [
    ["pinch", "Stisak sredine", "", "Plus stiska sredinu, minus je naduva."],
    ["fan", "Lepeza", "", "Plus naginje krajnja slova ka spolja."],
    ["arch", "Luk", "", "Plus diže sredinu, minus je spušta."],
    ["persp", "Perspektiva", "", "Plus povećava desni kraj."],
    ["wave", "Talas"],
    ["waveFreq", "Broj talasa"],
    ["wavePhase", "Pomeraj talasa", "°"],
    ["slant", "Kosina"],
    ["rotate", "Rotacija", "°"],
  ],
  rowsGrad: [["gradAngle", "Ugao prelaza", "°"]],
  rowsStroke: [["strokeWidth", "Debljina"]],
  rowsShadow: [
    ["shadowOpacity", "Providnost"],
    ["shadowX", "Pomeraj levo/desno"],
    ["shadowY", "Pomeraj gore/dole"],
    ["shadowBlur", "Zamućenje"],
  ],
  rowsExtrude: [
    ["extrudeDepth", "Dubina"],
    ["extrudeAngle", "Smer", "°"],
  ],
  rowsExport: [
    ["padding", "Margina oko natpisa"],
    ["pngWidth", "Širina PNG-a u pikselima"],
  ],
};

/** Section switches and the fieldset each one enables. */
const TOGGLES: Partial<Record<BoolKey, string>> = { gradOn: "fsGrad", strokeOn: "fsStroke", shadowOn: "fsShadow", extrudeOn: "fsExtrude", bgOn: "fsBg" };
const CHECKS: BoolKey[] = ["upper", "kerning", ...(Object.keys(TOGGLES) as BoolKey[])];
/** Segmented button groups; the container id is the state key, each button's data-v its value. */
const SEGS = ["align", "strokeJoin", "strokePos", "ground"] as const;
const SWATCHES = ["#d7261e", "#111111", "#ffffff", "#f2c230", "#1f4fbf", "#1e7a3e", "#e86a1c", "#7a3fb0"];

const decimals = (step: number) => (String(step).split(".")[1] || "").length;
const numInputs = new Map<NumKey, { r: HTMLInputElement; n: HTMLInputElement; d: number }>();
const fontsBox = $("fonts");

/** Clicks on `[data-attr]` buttons inside `el` call `fn` with that attribute's value. */
function onPick(el: HTMLElement, attr: string, fn: (v: string) => void) {
  el.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>(`[data-${attr}]`);
    if (b) fn(b.dataset[attr]!);
  });
}

function buildRows() {
  for (const [box, rows] of Object.entries(ROWS)) {
    const host = $(box);
    for (const [key, label, unit = "", hint] of rows) {
      const [min, max, step] = LIMITS[key];
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        `<label for="${key}">${label}${unit ? ` (${unit})` : ""}</label>` +
        `<input type="number" id="${key}-n" min="${min}" max="${max}" step="${step}" aria-label="${label}, broj">` +
        `<input type="range" id="${key}" min="${min}" max="${max}" step="${step}">` +
        (hint ? `<div class="hint">${hint}</div>` : "");
      host.appendChild(row);
      const r = row.querySelector<HTMLInputElement>('input[type="range"]')!;
      const n = row.querySelector<HTMLInputElement>('input[type="number"]')!;
      const d = decimals(step);
      numInputs.set(key, { r, n, d });
      r.addEventListener("input", () => store.set(key, +r.value));
      n.addEventListener("change", () => {
        const v = parseFloat(n.value);
        // An unreadable number still triggers a sync, which puts the current value back.
        store.set(key, Number.isFinite(v) ? clamp(key, v) : store.s[key]);
      });
      // Double-click a label to reset just that value.
      row.querySelector("label")!.addEventListener("dblclick", () => store.set(key, DEFAULTS[key]));
    }
  }
}

/** Adds the font's picker tile, or refreshes its name and preview when it already exists. */
export function showFontTile(f: FontEntry) {
  let lab = fontsBox.querySelector(`input[value="${f.id}"]`)?.closest("label");
  if (!lab) {
    lab = document.createElement("label");
    lab.className = "tile";
    lab.innerHTML = `<input type="radio" name="font" value="${f.id}"><span class="sample">Aa Šđ</span><span class="nm"></span>`;
    lab.querySelector("input")!.addEventListener("change", () => store.set("font", f.id));
    fontsBox.appendChild(lab);
  }
  lab.querySelector(".nm")!.textContent = f.name;
  lab.querySelector<HTMLElement>(".sample")!.style.fontFamily = `'${f.family}', var(--ui)`;
}

export function initControls() {
  buildRows();
  FONTS.forEach(showFontTile);

  const presets = $("presets");
  presets.innerHTML = PRESETS.map((p) =>
    `<button type="button" data-p="${p.id}" title="${p.name}"><svg viewBox="0 0 60 26" aria-hidden="true"></svg><span>${p.name}</span></button>`).join("");
  onPick(presets, "p", (id) => {
    const p = PRESETS.find((x) => x.id === id)!;
    store.assign({ ...WARP0, ...p.w, ...p.extra });
  });

  const sw = $("swatches");
  sw.innerHTML = SWATCHES.map((c) => `<button type="button" class="sw" data-c="${c}" style="background:${c}" aria-label="Boja ${c}"></button>`).join("");
  onPick(sw, "c", (c) => store.set("fill", c));

  $<HTMLTextAreaElement>("text").addEventListener("input", (e) => store.set("text", (e.target as HTMLTextAreaElement).value));
  for (const k of CHECKS) $(k).addEventListener("change", (e) => store.set(k, (e.target as HTMLInputElement).checked));
  for (const k of COLOR_KEYS) {
    $(k).addEventListener("input", (e) => store.set(k, (e.target as HTMLInputElement).value));
    $(k + "Hex").addEventListener("change", (e) => {
      let v = (e.target as HTMLInputElement).value.trim();
      if (!v.startsWith("#")) v = "#" + v;
      if (/^#[0-9a-f]{3}$/i.test(v)) v = "#" + [...v.slice(1)].map((c) => c + c).join("");
      // An invalid code still triggers a sync, which puts the current color back.
      store.set(k, isHex(v) ? v.toLowerCase() : store.s[k]);
    });
  }
  for (const k of SEGS) onPick($(k), "v", (v) => store.set(k, v as State[typeof k]));
  $("reset").addEventListener("click", () => store.assign({ ...DEFAULTS, text: store.s.text }));
}

export function syncUI() {
  const s = store.s;
  const text = $<HTMLTextAreaElement>("text");
  if (text.value !== s.text) text.value = s.text;
  for (const k of CHECKS) $<HTMLInputElement>(k).checked = s[k];
  for (const [k, fs] of Object.entries(TOGGLES)) $<HTMLFieldSetElement>(fs).disabled = !s[k as BoolKey];
  for (const k of COLOR_KEYS) { $<HTMLInputElement>(k).value = s[k]; $<HTMLInputElement>(k + "Hex").value = s[k]; }
  for (const [k, { r, n, d }] of numInputs) { r.value = String(s[k]); n.value = s[k].toFixed(d); }
  for (const k of SEGS) $(k).querySelectorAll<HTMLElement>("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === s[k])));
  $("stage").dataset.ground = s.ground;
  fontsBox.querySelectorAll<HTMLInputElement>("input").forEach((i) => (i.checked = i.value === s.font));
}
