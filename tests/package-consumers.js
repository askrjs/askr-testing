import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "@typescript/typescript6";

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is unavailable; run this check through npm");
const root = process.cwd();
const npm = (args, options) => execFileSync(process.execPath, [npmCli, ...args], options);
const contract = JSON.parse(await readFile("tests/public-contract.json", "utf8"));
const directory = await mkdtemp(join(tmpdir(), "askr-testing-consumer-"));
try {
  const output = JSON.parse(
    npm(["pack", "--ignore-scripts", "--json", "--pack-destination", directory], {
      encoding: "utf8",
    }),
  );
  const packed = Array.isArray(output) ? output[0] : Object.values(output)[0];
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  npm(
    ["install", "--no-audit", "--no-fund", "--no-package-lock", join(directory, packed.filename)],
    { cwd: directory, stdio: "pipe" },
  );
  const manifest = JSON.parse(
    await readFile(join(directory, "node_modules/@askrjs/testing/package.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(manifest.exports).sort(), contract.exportKeys);

  const fixture = join(directory, "contract.ts");
  await writeFile(
    fixture,
    `${await readFile("tests/types/public-contract.ts", "utf8")}\nimport * as Surface from "@askrjs/testing"; void Surface;\n`,
  );
  await writeFile(
    join(directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        types: [],
        lib: ["ES2022", "DOM", "DOM.Iterable"],
      },
      files: ["contract.ts"],
    }),
  );
  execFileSync(
    process.execPath,
    [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"],
    { cwd: directory, stdio: "pipe" },
  );
  const program = ts.createProgram([fixture], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    types: [],
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => directory,
      getNewLine: () => "\n",
    }),
  );
  const checker = program.getTypeChecker();
  const declaration = program
    .getSourceFile(fixture)
    .statements.find(
      (statement) =>
        ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === "@askrjs/testing",
    );
  const symbols = checker
    .getExportsOfModule(checker.getSymbolAtLocation(declaration.moduleSpecifier))
    .map((symbol) => symbol.name)
    .sort();
  assert.deepEqual(symbols, [...contract.values, ...contract.types].sort());

  await writeFile(
    join(directory, "runtime.mjs"),
    `
    import assert from 'node:assert/strict';
    import * as api from '@askrjs/testing';
    assert.deepEqual(Object.keys(api).sort(), ${JSON.stringify(contract.values)});
    for (const path of ${JSON.stringify(contract.privateSubpaths)})
      await assert.rejects(import('@askrjs/testing/' + path), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
    const { createTestClient, createTestCookieJar, inject } = api;
    const jar = createTestCookieJar();
    const client = createTestClient(request => new URL(request.url).pathname === '/login'
      ? new Response(null, { status: 303, headers: { location: '/account', 'set-cookie': 'session=active; Secure; Path=/' } })
      : new Response(request.headers.get('cookie')), { cookies: jar, redirect: 'follow' });
    assert.equal(await (await client.post('/login', { json: { user: 'user' } })).text(), 'session=active');
    await jar.clear();
    assert.equal(await (await client.get('/account')).text(), '');
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0, 128, 255])); controller.close(); } });
    const response = await inject(request => new Response(request.body), '/', { method: 'POST', body });
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0, 128, 255]);
    let calls = 0;
    assert.throws(() => inject(() => { calls++; return new Response(); }, '/', { maxRedirects: Infinity }), /maxRedirects/);
    assert.equal(calls, 0);
    const reason = new Error('custom cookie store failed');
    let cancelled = 0;
    const failing = createTestClient(() => new Response(new ReadableStream({ cancel() { cancelled++; } }), {
      headers: { 'set-cookie': 'session=active; Path=/' },
    }), { cookies: { getCookies: async () => [], setCookie: async () => { throw reason; }, clear: async () => {} } });
    await assert.rejects(failing.get('/'), error => error === reason);
    assert.equal(cancelled, 1);
  `,
  );
  execFileSync(process.execPath, [join(directory, "runtime.mjs")], {
    cwd: directory,
    stdio: "pipe",
  });
  console.log(
    JSON.stringify({
      normalInstall: true,
      declarationNames: symbols.length,
      removedNames: contract.removed.length,
      privateSubpaths: contract.privateSubpaths.length,
      compilers: ["6.0.2", "7.0.2"],
      runtime: [
        "redirect session",
        "jar clear",
        "stream body",
        "invalid redirect limit",
        "custom store failure",
      ],
    }),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
