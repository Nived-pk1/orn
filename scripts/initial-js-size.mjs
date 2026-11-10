// Prints the exact initial-JS gzip bytes of a build: the scripts and module preloads index.html names.
// Usage: node scripts/initial-js-size.mjs [dist ...]   (default: dist dist-studio)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

/** The .js files index.html loads at start: script src and link href, in document order, without duplicates. */
export function initialScripts(html) {
  const names = [
    ...html.matchAll(/<(?:script|link)\s[^>]*(?:src|href)="\/?([^"]+\.js)"/gi),
  ].map((match) => match[1]);
  return [...new Set(names)];
}

export function initialGzipBytes(dist) {
  const index = join(dist, "index.html");
  if (!existsSync(index)) return undefined;
  const files = initialScripts(readFileSync(index, "utf8")).filter((name) =>
    existsSync(join(dist, name)),
  );
  return files.reduce(
    (sum, name) => sum + gzipSync(readFileSync(join(dist, name))).length,
    0,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dists =
    process.argv.length > 2 ? process.argv.slice(2) : ["dist", "dist-studio"];
  for (const dist of dists) {
    const bytes = initialGzipBytes(dist);
    console.log(
      `${dist}: ${bytes === undefined ? "no index.html (build it first)" : `${bytes} bytes gzip`}`,
    );
  }
}
