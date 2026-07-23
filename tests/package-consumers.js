import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const node = process.execPath;
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is unavailable; run this check through npm");
const directory = mkdtempSync(join(tmpdir(), "askr-testing-consumer-"));
const { name, version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const tarballName = `${name.startsWith("@") ? name.slice(1).replace("/", "-") : name}-${version}.tgz`;
const tarball = join(directory, tarballName);

execFileSync(node, [npmCli, "pack", "--pack-destination", directory], { stdio: "ignore" });

for (const name of ["javascript", "typescript"]) {
  const consumer = join(directory, name);
  mkdirSync(consumer);
  execFileSync(node, [npmCli, "init", "-y"], { cwd: consumer, stdio: "ignore" });
  execFileSync(
    node,
    [npmCli, "install", tarball, ...(name === "typescript" ? ["typescript@6"] : [])],
    {
      cwd: consumer,
      stdio: "ignore",
    },
  );
}

const javascript = join(directory, "javascript");
writeFileSync(
  join(javascript, "smoke.mjs"),
  `import { createTestClient, inject } from "@askrjs/testing";
const response = await inject(() => new Response("js-ok"), "/");
if (await response.text() !== "js-ok") throw new Error("inject smoke failed");
const client = createTestClient(request => new Response(request.url));
if (await (await client.get("/ok")).text() !== "https://askr.test/ok") throw new Error("client smoke failed");
`,
);
execFileSync(node, ["smoke.mjs"], { cwd: javascript, stdio: "inherit" });

const typescript = join(directory, "typescript");
writeFileSync(
  join(typescript, "smoke.ts"),
  `import { inject, createTestRequest, type TestCookieJar } from "@askrjs/testing";
const request = createTestRequest("/", { method: "POST", json: { ok: true } });
const response: Promise<Response> = inject(() => new Response(), request);
let jar: TestCookieJar; void response; void jar!;
`,
);
execFileSync(
  node,
  [
    join(typescript, "node_modules", "typescript", "bin", "tsc"),
    "--ignoreConfig",
    "--noEmit",
    "--strict",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "smoke.ts",
  ],
  { cwd: typescript, stdio: "inherit" },
);
