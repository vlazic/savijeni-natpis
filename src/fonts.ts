// Bundled fonts (public/fonts, OFL) and the viewer's own uploaded font.
import { parse, type Font } from "opentype.js";

export interface FontEntry {
  id: string;
  name: string;
  /** CSS family the picker tile previews with, registered once the bytes are in. */
  family: string;
  file?: string;
  /** Set once parsed, so render can draw without awaiting. */
  font?: Font;
  loading?: Promise<Font>;
}

const bundled = (id: string, name: string, file: string): FontEntry => ({ id, name, file: "fonts/" + file, family: "nf-" + id });

export const FONTS: FontEntry[] = [
  bundled("anton", "Anton", "Anton-Regular.ttf"),
  bundled("bebas", "Bebas Neue", "BebasNeue-Regular.ttf"),
  bundled("archivo", "Archivo Black", "ArchivoBlack-Regular.ttf"),
  bundled("passion", "Passion One", "PassionOne-Bold.ttf"),
  bundled("alfa", "Alfa Slab One", "AlfaSlabOne-Regular.ttf"),
  bundled("russo", "Russo One", "RussoOne-Regular.ttf"),
];

export const findFont = (id: string) => FONTS.find((f) => f.id === id);

/** Registers the bytes as a CSS font so the picker tile can preview it. Best effort. */
async function registerFace(family: string, buf: ArrayBuffer): Promise<boolean> {
  try {
    document.fonts.add(await new FontFace(family, buf.slice(0)).load());
    return true;
  } catch {
    return false;
  }
}

/** Fetches and parses a bundled font once; later calls share the same promise. */
export function loadFont(f: FontEntry): Promise<Font> {
  f.loading ??= fetch(import.meta.env.BASE_URL + f.file)
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
    .then((buf) => {
      void registerFace(f.family, buf);
      return (f.font = parse(buf));
    })
    .catch((e) => {
      f.loading = undefined; // let a later render try again (e.g. after a network blip)
      throw e;
    });
  return f.loading;
}

export class FontFileError extends Error {}

/** Parses an uploaded file into the "custom" entry, creating it on first use. */
export async function loadCustomFont(file: File): Promise<FontEntry> {
  let buf: ArrayBuffer, font: Font;
  try {
    buf = await file.arrayBuffer();
    const magic = String.fromCharCode(...new Uint8Array(buf, 0, Math.min(4, buf.byteLength)));
    if (magic === "wOF2") throw new FontFileError("WOFF2 nije podržan. Učitaj TTF, OTF ili WOFF verziju fonta.");
    font = parse(buf);
  } catch (e) {
    throw e instanceof FontFileError ? e : new FontFileError("Ovaj fajl nije čitljiv font. Probaj TTF ili OTF.");
  }

  let entry = findFont("custom");
  if (!entry) { entry = { id: "custom", name: "", family: "" }; FONTS.push(entry); }
  entry.font = font;
  entry.loading = Promise.resolve(font);
  entry.name = file.name.replace(/\.[^.]+$/, "");
  // A fresh family name per upload, so replacing the custom font also refreshes its preview.
  const family = "nf-custom-" + Date.now();
  if (await registerFace(family, buf)) entry.family = family;
  return entry;
}
