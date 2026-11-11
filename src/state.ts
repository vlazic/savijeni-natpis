// The live settings: loaded from per-viewer storage, saved on change, with change listeners.
import { sanitize, type State } from "./settings";

const STORE_KEY = "savijeni-natpis-v1";

function loadSaved(): State {
  try { return sanitize(JSON.parse(localStorage.getItem(STORE_KEY) || "null")); }
  catch { return sanitize(null); } // storage blocked or corrupt: defaults
}

const listeners = new Set<() => void>();
let saveT: ReturnType<typeof setTimeout> | undefined;

function save() {
  clearTimeout(saveT);
  saveT = undefined;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store.s)); } catch { /* ignore */ }
}
// The save is debounced; write a pending one before the page goes away.
addEventListener("pagehide", () => { if (saveT) save(); });

export const store = {
  s: loadSaved(),
  set<K extends keyof State>(k: K, v: State[K]) { this.s[k] = v; this.changed(); },
  assign(patch: Partial<State>) { Object.assign(this.s, patch); this.changed(); },
  subscribe(fn: () => void) { listeners.add(fn); },
  changed() {
    listeners.forEach((fn) => fn());
    clearTimeout(saveT);
    saveT = setTimeout(save, 300);
  },
};
