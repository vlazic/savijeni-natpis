# Savijeni natpis

Warped-lettering SVG/PNG generator. Started 2026-11-11 from a photo of the word TIGHTEN (letters tall at
the ends, short in the middle, leaning outward); the "Kao na slici" preset (pinch 0.3, fan 0.13, Anton,
#d7261e) reproduces it and is the default. UI copy is Serbian Latin.

## Layout
- `src/geometry.ts` pure: layout from opentype.js outlines, flatten (lines subdivided so the warp can
  bend them), envelope warp, RDP simplify, path data. Tested in `src/geometry.test.ts`.
- `src/svg.ts` pure: builds the SVG (one `<path id="nt">` in defs, `<use>` copies for stroke, 3D, shadow).
- `src/settings.ts` pure: settings type, presets, defaults. `src/state.ts` the live store (localStorage).
- `src/controls.ts` panel built from tables; handlers only write the store, `syncUI()` runs after
  every change (batched with render in one frame, `src/main.ts`).
- `src/fonts.ts` bundled fonts in `public/fonts`, fetched by relative URL. `src/export.ts` downloads.

## Two deploy targets, one build
- GitHub Pages: `dist/` (workflow on push to main). Downloads use a plain `<a download>`.
- claude.ai artifact: https://claude.ai/artifact/TYvL3sXnb5FoT1ZEnkoxiF (shared: anyone with the link).
  `pnpm build` also writes `dist-artifact/artifact.html` (plugin in `vite.config.ts`). Publish with the
  Artifact tool: `file_path` `dist-artifact/artifact.html`, `url` the link above, `root` `dist`,
  `files` each `fonts/*.ttf`. Omit `capabilities` on redeploy (it keeps `{downloads: true}`).

## Artifact constraints that shape the code
- CSP allows scripts only from a few CDNs and blocks separate JS/CSS files, so Vite inlines everything
  (`vite-plugin-singlefile`). `fetch` works only for files published next to the page, hence fonts in
  `public/fonts` with `base: "./"`.
- `<a download>` is inert in the viewer; saves go through `claude.use("downloads").save()`.
  `window.claude` absent means not in the viewer, so the plain link fallback is used.
- The `claude-artifact` plugin strips the doctype/html/head/body wrapper (the platform adds its own)
  and requires `<title>` to be first in `<head>`.
- No `alert/confirm/prompt`, no print; clipboard write must happen inside the click handler.
