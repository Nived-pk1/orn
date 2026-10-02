/**
 * scripts/check-build.mjs against a small fixture `dist` (step 4.6, ADR-035): a good build passes; every way a build can be wrong fails and
 * names the file: the policy, a missing worker chunk, WASM inlined or unhashed or not WASM, `eval(` / `new Function` / `Function(` in any chunk
 * but RDKit's glue chunk, the glue chunk mentioned by a chunk that is not the chem worker, RDKit merged into one of our chunks.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../scripts/check-build.mjs', import.meta.url));
const POLICY = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; object-src 'none'";
const WASM_NAME = 'RDKit_minimal-AbCd1234.wasm';
const WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 1, 2, 3, 4]);
const DEMO = readFileSync(fileURLToPath(new URL('../../data/seed/demo.orn.json', import.meta.url)));
const dirs: string[] = [];

const page = (policy = POLICY): string =>
  `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy.replaceAll("'", '&#39;')}"><script type="module" crossorigin src="/assets/index-x.js"></script></head><body></body></html>`;

type Files = Record<string, string | Buffer | null>;
const good = (): Files => ({
  'index.html': page(),
  'assets/index-x1.js': 'console.log("app")',
  'assets/worker-chem-c1.js': `import("./rdkit-glue-g1.js"); const wasm = "${WASM_NAME}";`,
  'assets/worker-layout-l1.js': 'export const layout = 1',
  'assets/worker-search-s1.js': 'export const search = 1',
  'assets/worker-compute-k1.js': 'export const compute = 1',
  'assets/rdkit-glue-g1.js': 'var f = new Function("a", "return a"); eval("1");',
  [`assets/${WASM_NAME}`]: WASM,
  'assets/demo.orn-d1.json': DEMO,
});

function run(files: Files): { status: number | null; out: string } {
  const root = mkdtempSync(join(tmpdir(), 'orn-build-'));
  dirs.push(root);
  const dist = join(root, 'dist');
  const merged = { ...good(), ...files };
  for (const [path, content] of Object.entries(merged)) {
    if (content === null) continue;
    mkdirSync(dirname(join(dist, path)), { recursive: true });
    writeFileSync(join(dist, path), content);
  }
  const doc = join(root, 'SECURITY.md');
  writeFileSync(doc, `# Security\n\n## 4. Content-Security-Policy\n\nInjected: \`${POLICY}\`.\n\n## 5. Delivery\n\nnot \`default-src 'none'\`\n`);
  const result = spawnSync(process.execPath, [SCRIPT, dist, doc], { encoding: 'utf8' });
  return { status: result.status, out: result.stdout + result.stderr };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('scripts/check-build.mjs', () => {
  it('passes a good build and lists the chunks it found', () => {
    const { status, out } = run({});
    expect(status).toBe(0);
    expect(out).toContain('build smoke: passed');
    for (const name of ['chem', 'layout', 'search', 'compute']) expect(out).toContain(`worker ${name}: assets/worker-${name}-`);
    expect(out).toContain(`wasm: assets/${WASM_NAME}`);
    expect(out).toContain('rdkit glue: assets/rdkit-glue-g1.js');
    expect(out).toContain('demo dataset: assets/demo.orn-d1.json');
  });

  it('fails when the demo dataset is missing, duplicated or not the repo file (step 5.1d)', () => {
    const missing = run({ 'assets/demo.orn-d1.json': null });
    expect(missing.status).toBe(1);
    expect(missing.out).toContain('expected exactly one copy of the demo dataset, found 0');
    const twice = run({ 'assets/demo.orn-d2.json': DEMO });
    expect(twice.status).toBe(1);
    expect(twice.out).toContain('found 2');
    const changed = run({ 'assets/demo.orn-d1.json': Buffer.concat([DEMO, Buffer.from(' ')]) });
    expect(changed.status).toBe(1);
    expect(changed.out).toContain('FAIL assets/demo.orn-d1.json: differs from data/seed/demo.orn.json');
  });

  it('fails when the page policy differs from SECURITY section 4, naming index.html', () => {
    const { status, out } = run({ 'index.html': page(`${POLICY}; script-src 'unsafe-eval'`) });
    expect(status).toBe(1);
    expect(out).toContain('FAIL index.html: the policy is not the one of');
  });

  it('fails when the page has no policy, or an inline script', () => {
    const none = run({ 'index.html': '<!doctype html><html><head></head><body></body></html>' });
    expect(none.status).toBe(1);
    expect(none.out).toContain('FAIL index.html: expected exactly one Content-Security-Policy meta tag, found 0');
    const inline = run({ 'index.html': page().replace('</head>', '<script>alert(1)</script></head>') });
    expect(inline.status).toBe(1);
    expect(inline.out).toContain('FAIL index.html: has an inline script');
  });

  it.each(['chem', 'layout', 'search', 'compute'])('fails when the %s worker chunk is missing', (name) => {
    const { status, out } = run({ [`assets/worker-${name}-${{ chem: 'c1', layout: 'l1', search: 's1', compute: 'k1' }[name]}.js`]: null });
    expect(status).toBe(1);
    expect(out).toContain(`FAIL assets/worker-${name}-<hash>.js: expected exactly one worker chunk, found 0`);
  });

  it('fails when WASM is inlined in a chunk (a data URL, or a base64 run starting with the magic bytes)', () => {
    const url = run({ 'assets/worker-layout-l1.js': 'const w = "data:application/wasm;base64,AAAA"' });
    expect(url.status).toBe(1);
    expect(url.out).toContain('FAIL assets/worker-layout-l1.js: has WASM inlined');
    const base64 = run({ 'assets/worker-search-s1.js': `const w = "AGFzbQ${'A'.repeat(200)}"` });
    expect(base64.status).toBe(1);
    expect(base64.out).toContain('FAIL assets/worker-search-s1.js: has WASM inlined');
  });

  it('fails when the WASM asset is missing, unhashed, not WASM, or not named by the chem worker', () => {
    const missing = run({ [`assets/${WASM_NAME}`]: null });
    expect(missing.out).toContain('FAIL assets/*.wasm: expected exactly one WASM asset, found 0');
    const unhashed = run({ [`assets/${WASM_NAME}`]: null, 'assets/RDKit_minimal.wasm': WASM, 'assets/worker-chem-c1.js': 'import("./rdkit-glue-g1.js"); "RDKit_minimal.wasm"' });
    expect(unhashed.status).toBe(1);
    expect(unhashed.out).toContain('FAIL assets/RDKit_minimal.wasm: is not a hashed asset');
    const notWasm = run({ [`assets/${WASM_NAME}`]: Buffer.from('not wasm at all') });
    expect(notWasm.out).toContain(`FAIL assets/${WASM_NAME}: does not start with the WASM magic bytes`);
    const unnamed = run({ 'assets/worker-chem-c1.js': 'import("./rdkit-glue-g1.js")' });
    expect(unnamed.out).toContain(`FAIL assets/worker-chem-c1.js: does not refer to the WASM asset ${WASM_NAME}`);
  });

  it.each([
    ['eval(', 'var r = eval("1 + 1");'],
    ['new Function', 'var f = new Function("return 1");'],
    ['Function(', 'var f = Function("return 1");'],
    ['(0, eval)', 'var g = (0, eval)("this");'],
  ])('fails on `%s` in any chunk but the RDKit glue: an app chunk, a worker, a library chunk', (label, code) => {
    for (const file of ['assets/index-x1.js', 'assets/worker-layout-l1.js', 'assets/elk.bundled-e1.js']) {
      const { status, out } = run({ [file]: code });
      expect(status, file).toBe(1);
      expect(out, file).toContain(`FAIL ${file}: contains \`${label}\``);
    }
  });

  it('does not take a name that merely contains these words for a call', () => {
    expect(run({ 'assets/index-x1.js': 'isFunction(x); retrieval(1); a.eval = 1; const fn = Function;' }).status).toBe(0);
  });

  it('fails when RDKit is merged into the chem worker (no glue chunk): the worker chunk is scanned and named', () => {
    const { status, out } = run({ 'assets/rdkit-glue-g1.js': null, 'assets/worker-chem-c1.js': `var f = new Function("a"); const wasm = "${WASM_NAME}";` });
    expect(status).toBe(1);
    expect(out).toContain('FAIL assets/worker-chem-c1.js: contains `new Function`');
  });

  it('fails when a chunk other than the chem worker loads the RDKit glue chunk', () => {
    const { status, out } = run({ 'assets/worker-search-s1.js': 'import("./rdkit-glue-g1.js")' });
    expect(status).toBe(1);
    expect(out).toContain('FAIL assets/worker-search-s1.js: refers to RDKit');
  });
});
