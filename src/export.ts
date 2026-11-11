// Getting files out: the claude.ai `downloads` capability inside the artifact viewer,
// a plain download link everywhere else (vite dev, GitHub Pages), and the clipboard.
import { $ } from "./dom";
import type { SvgResult } from "./svg";

interface DownloadsApi { save(req: { filename: string; data: string | Blob }): Promise<unknown> }
declare global {
  interface Window { claude?: { use(name: string): Promise<unknown> } }
}

const statusEl = $("status");
let flashT: ReturnType<typeof setTimeout>;
export function flash(msg: string, err = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("err", err);
  clearTimeout(flashT);
  flashT = setTimeout(() => { statusEl.textContent = ""; }, 6000);
}

type Saver = (filename: string, data: string | Blob) => Promise<void>;

const unavailable: Saver = async () => flash("Preuzimanje ovde nije dostupno. Koristi Kopiraj SVG kod.", true);

const linkSave: Saver = async (filename, data) => {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: "image/svg+xml" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const viewerSave = (downloads: DownloadsApi): Saver => async (filename, data) => {
  try {
    await downloads.save({ filename, data });
    flash(`Sačuvano: ${filename}`);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "declined") return;
    if (code === "rate_limited") flash("Već je otvoren jedan prozor za čuvanje. Završi ga pa pokušaj ponovo.", true);
    else await unavailable(filename, data);
  }
};

/**
 * Chosen once. Inside the claude.ai viewer `<a download>` is inert, so saves go through the
 * `downloads` capability (or nowhere); outside it a plain link works. Awaiting this at click time
 * means a click during startup waits for the capability instead of failing.
 */
const saver: Promise<Saver> = typeof window.claude?.use === "function"
  ? window.claude.use("downloads").then((d) => (d ? viewerSave(d as DownloadsApi) : unavailable), () => unavailable)
  : Promise.resolve(linkSave);

export const offer: Saver = async (filename, data) => (await saver)(filename, data);

const MAX_PX = 8192;

/** PNG pixel size for the requested width (max 8000 in the UI); tall text is capped by height. */
export function pngSize(r: SvgResult, pngWidth: number) {
  const scale = Math.min(pngWidth / r.w, MAX_PX / r.h);
  return { w: Math.max(1, Math.round(r.w * scale)), h: Math.max(1, Math.round(r.h * scale)) };
}

export function fileBase(text: string): string {
  const t = text.toLowerCase()
    .replace(/đ/g, "dj").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-+|-+$/g, "");
  return t || "natpis";
}

export async function makePng(r: SvgResult, pngWidth: number): Promise<Blob> {
  const { w, h } = pngSize(r, pngWidth);
  const url = URL.createObjectURL(new Blob([r.svg], { type: "image/svg+xml" }));
  try {
    const img = new Image(w, h);
    img.src = url;
    await img.decode();
    const cv = Object.assign(document.createElement("canvas"), { width: w, height: h });
    cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return await new Promise((ok, bad) => cv.toBlob((b) => (b ? ok(b) : bad(new Error("toBlob"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Clipboard first; if the frame refuses, reveal the code selected so Ctrl+C works. */
export function copySvg(svg: string, box: HTMLTextAreaElement) {
  const fallback = () => {
    box.hidden = false;
    box.value = svg;
    box.focus();
    box.select();
    flash("Kod je označen ispod. Pritisni Ctrl+C da ga kopiraš.");
  };
  try {
    navigator.clipboard.writeText(svg).then(() => flash("SVG kod je kopiran."), fallback);
  } catch {
    fallback();
  }
}
