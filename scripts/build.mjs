import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("src/manifest.json", "dist/manifest.json");

console.log("Built dist/ (manifest only: no extension entry point yet)");
