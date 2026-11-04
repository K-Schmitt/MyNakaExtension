import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

const COMMON = {
  bundle: true,
  target: "chrome120",
  sourcemap: false,
  logLevel: "warning",
};

const ENTRIES = [
  { in: "src/sw/main.ts", out: "dist/sw.js", format: "esm" },
  {
    in: "src/content/naka-isolated.ts",
    out: "dist/naka-isolated.js",
    format: "iife",
  },
  { in: "src/page/naka-main.ts", out: "dist/naka-main.js", format: "iife" },
  { in: "src/status/status.ts", out: "dist/status.js", format: "iife" },
];

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

for (const entry of ENTRIES) {
  await build({
    ...COMMON,
    entryPoints: [entry.in],
    outfile: entry.out,
    format: entry.format,
  });
}

await cp("src/manifest.json", "dist/manifest.json");
await cp("src/status/status.html", "dist/status.html");

console.log(`Built dist/ (${ENTRIES.length} bundles, manifest, status page)`);
