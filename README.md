# Savijeni natpis

Browser tool that turns text into warped block lettering, like a sign whose letters are tallest at the
ends and squeezed in the middle, and exports it as a vector SVG or a transparent PNG.

Text, six bundled fonts or your own (TTF, OTF, WOFF), letter spacing and width, eight shape presets
plus sliders for pinch, fan, arch, perspective, wave, slant and rotation, fill or gradient, outline,
shadow, 3D extrusion and background. The SVG is pure paths, so it does not need the font installed.

## Develop

```sh
pnpm install
pnpm dev      # local dev server
pnpm test     # geometry and SVG unit tests
pnpm build    # dist/ for GitHub Pages, dist-artifact/artifact.html for claude.ai
```

Pushing to `main` deploys `dist/` to GitHub Pages through `.github/workflows/pages.yml`.

## Fonts

Anton, Bebas Neue, Archivo Black, Passion One, Alfa Slab One and Russo One, all under the SIL Open
Font License 1.1 (texts in `licenses/`), from [google/fonts](https://github.com/google/fonts).
