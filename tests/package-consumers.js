import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const node = process.execPath;
const directory = mkdtempSync(join(tmpdir(), "askr-testing-consumer-"));
const tarball = join(directory, "askrjs-testing-0.0.1.tgz");

execFileSync(npm, ["pack", "--pack-destination", directory], { stdio: "ignore" });

for (const name of ["javascript", "typescript"]) {
  const consumer = join(directory, name);
  mkdirSync(consumer);
  execFileSync(npm, ["init", "-y"], { cwd: consumer, stdio: "ignore" });
  execFileSync(npm, ["install", tarball, ...(name === "typescript" ? ["typescript@6"] : [])], {
    cwd: consumer,
    stdio: "ignore",
  });
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
  join(typescript, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc"),
  [
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
