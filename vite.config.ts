import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Writes dist-artifact/artifact.html, the shape the claude.ai Artifact tool publishes: no
 * doctype/html/head/body wrapper (the platform adds its own, with charset and viewport), <title>
 * first. Kept out of dist/ so GitHub Pages does not ship it.
 */
function claudeArtifact(): Plugin {
  let root = ".";
  return {
    name: "claude-artifact",
    apply: "build",
    enforce: "post",
    configResolved(config) { root = config.root; },
    // writeBundle runs only after a successful write, and the bundle already holds the inlined page.
    writeBundle(_options, bundle) {
      const page = bundle["index.html"];
      if (page?.type !== "asset") throw new Error("claude-artifact: no index.html in the bundle");
      const html = String(page.source);
      const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
      const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1];
      if (head == null || body == null) throw new Error("claude-artifact: index.html has no <head> or <body>");
      const kept = head
        .replace(/<meta\b[^>]*\bcharset\b[^>]*>/gi, "")
        .replace(/<meta\b[^>]*\bname=["']viewport["'][^>]*>/gi, "")
        .trim();
      if (!kept.startsWith("<title>")) throw new Error("<title> must come first in index.html <head>");
      const out = resolve(root, "dist-artifact");
      mkdirSync(out, { recursive: true });
      writeFileSync(resolve(out, "artifact.html"), `${kept}\n${body.trim()}\n`);
    },
  };
}

// The artifact CSP blocks scripts and stylesheets served as separate files, so everything is
// inlined into one HTML. Fonts stay in public/fonts and are fetched by relative URL, which the
// artifact allows; `base: "./"` also makes the build work under the GitHub Pages subpath.
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile(), claudeArtifact()],
});
