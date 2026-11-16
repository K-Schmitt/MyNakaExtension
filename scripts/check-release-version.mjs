import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export function releaseVersionError(tag, manifestVersion, packageVersion) {
  const expected = `v${manifestVersion}`;
  if (tag !== expected) {
    return `Tag ${tag} does not match the manifest version ${manifestVersion} (expected ${expected})`;
  }
  if (manifestVersion !== packageVersion) {
    return `Tag ${tag} matches the manifest version ${manifestVersion} but not the package version ${packageVersion}`;
  }
  return undefined;
}

async function readVersion(path) {
  const url = new URL(`../${path}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8")).version;
}

async function main() {
  const manifest = await readVersion("src/manifest.json");
  const pkg = await readVersion("package.json");
  const error = releaseVersionError(process.argv[2] ?? "", manifest, pkg);
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(`Release ${process.argv[2]} agrees with manifest and package`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
