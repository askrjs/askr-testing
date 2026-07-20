import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is unavailable; run this check through npm");
const result = JSON.parse(
  execFileSync(process.execPath, [npmCli, "pack", "--ignore-scripts", "--dry-run", "--json"], {
    encoding: "utf8",
  }),
);

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const productionDependencies = Object.keys(manifest.dependencies ?? {}).sort();
if (JSON.stringify(productionDependencies) !== JSON.stringify(["tough-cookie"])) {
  throw new Error(`Unexpected production dependencies: ${productionDependencies.join(", ")}`);
}

if (result.length !== 1)
  throw new Error(`Expected one packed artifact, received ${result.length}.`);

const packedFiles = new Set(result[0].files.map(({ path }) => normalize(path)));
const expected = ["dist/index.d.ts", "dist/index.js", "LICENSE", "package.json", "README.md"];
if (packedFiles.size !== expected.length) {
  throw new Error(
    `Expected exactly ${expected.length} packed files, received ${packedFiles.size}.`,
  );
}
for (const file of expected) {
  if (!packedFiles.has(normalize(file))) throw new Error(`Packed artifact is missing ${file}.`);
}

const sourceMappingPattern = /[#@]\s*sourceMappingURL=([^\s*]+)/gu;
for (const file of result[0].files) {
  if (!/\.(?:d\.ts|js)$/u.test(file.path)) continue;
  const source = readFileSync(file.path, "utf8");
  for (const match of source.matchAll(sourceMappingPattern)) {
    const reference = match[1];
    if (reference.startsWith("data:")) continue;
    const mapPath = normalize(join(dirname(file.path), decodeURIComponent(reference)));
    if (!packedFiles.has(mapPath)) {
      throw new Error(`${file.path} references missing packed source map ${mapPath}.`);
    }
  }
}
