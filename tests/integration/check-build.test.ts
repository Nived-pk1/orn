/**
 * scripts/check-build.mjs against a small fixture `dist` (step 4.6, ADR-035): a good build passes; every way a build can be wrong fails and
 * names the file: the policy, a missing worker chunk, WASM inlined or unhashed or not WASM, `eval(` / `new Function` / `Function(` in any chunk
 * but RDKit's glue chunk, the glue chunk mentioned by a chunk that is not the chem worker, RDKit merged into one of our chunks.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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
const CHEM_POLICY = POLICY.replace("'wasm-unsafe-eval'", "'wasm-unsafe-eval' 'unsafe-eval'");

/** public/_headers as the build ships it (release preview), built from the test policy. */
const headers = (over: { page?: string; chem?: string; chemPath?: string; chemFirst?: string; robots?: string; extra?: string } = {}): string =>
  [
    '/*',
    `  Content-Security-Policy: ${over.page ?? `${POLICY}; frame-ancestors 'none'`}`,
    over.robots ?? '  X-Robots-Tag: noindex, nofollow',
    '',
    over.chemPath ?? '/assets/worker-chem-*.js',
    over.chemFirst ?? '  ! Content-Security-Policy',
    `  Content-Security-Policy: ${over.chem ?? `${CHEM_POLICY}; frame-ancestors 'none'`}`,
    over.extra ?? '',
  ].join('\n');

const page = (policy = POLICY): string =>
  `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy.replaceAll("'", '&#39;')}"><script type="module" crossorigin src="/assets/index-x1.js"></script></head><body></body></html>`;

type Files = Record<string, string | Buffer | null>;
const good = (): Files => ({
  'index.html': page(),
  'assets/index-x1.js': 'console.log("app")',
  'assets/views-other-v1.js': 'export const views = 1',
  'assets/import-inprocess-i1.js': 'export const inprocess = 1',
  'assets/export-inprocess-e1.js': 'export const exports = 1',
  'assets/import-screen-s1.js': 'export const screen = 1',
  'assets/export-screen-s1.js': 'export const screen = 2',
  'assets/worker-chem-c1.js': `import("./rdkit-glue-g1.js"); const wasm = "${WASM_NAME}";`,
  'assets/worker-layout-l1.js': 'export const layout = 1',
  'assets/worker-search-s1.js': 'export const search = 1',
  'assets/worker-compute-k1.js': 'export const compute = 1',
  'assets/rdkit-glue-g1.js': 'var f = new Function("a", "return a"); eval("1");',
  [`assets/${WASM_NAME}`]: WASM,
  'assets/demo.orn-d1.json': DEMO,
  _headers: headers(),
  'robots.txt': 'User-agent: *\nDisallow: /\n',
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

  it('lists the lazy chunks and the initial JS (step 5.7)', () => {
    const { status, out } = run({});
    expect(status).toBe(0);
    for (const name of ['views-other', 'import-inprocess', 'export-inprocess', 'import-screen', 'export-screen']) expect(out).toContain(`lazy chunk: ${name}`);
    expect(out).toContain('initial JS: assets/index-x1.js');
  });

  it('fails when a lazy chunk is missing, is loaded by the page, or the initial JS is over 400 kB gzip', () => {
    const missing = run({ 'assets/views-other-v1.js': null });
    expect(missing.status).toBe(1);
    expect(missing.out).toContain('FAIL assets/views-other-<hash>.js: the lazy chunk is missing');
    const eager = run({ 'index.html': page().replace('</head>', '<link rel="modulepreload" href="/assets/import-screen-s1.js"></head>') });
    expect(eager.status).toBe(1);
    expect(eager.out).toContain('FAIL import-screen: is loaded by index.html, so it is not lazy');
    const heavy = run({ 'assets/index-x1.js': randomBytes(410_000).toString('latin1') });
    expect(heavy.status).toBe(1);
    expect(heavy.out).toContain('over the 400 kB budget');
  });

  it('fails on eval( in a lazy chunk (the scan covers every chunk)', () => {
    const { status, out } = run({ 'assets/import-inprocess-i1.js': 'eval("1")' });
    expect(status).toBe(1);
    expect(out).toContain('assets/import-inprocess-i1.js');
  });

  it('fails when any chunk imports a worker entry chunk, statically or dynamically (2026-10-13, 5.10a review)', () => {
    const staticImport = run({ 'assets/import-inprocess-i1.js': 'import{a as x}from"./worker-compute-k1.js";export const y=x' });
    expect(staticImport.status).toBe(1);
    expect(staticImport.out).toContain('FAIL assets/import-inprocess-i1.js: imports the worker entry chunk worker-compute-k1.js');
    const dynamicImport = run({ 'assets/views-other-v1.js': 'export const load=()=>import("./worker-layout-l1.js")' });
    expect(dynamicImport.status).toBe(1);
    expect(dynamicImport.out).toContain('FAIL assets/views-other-v1.js: imports the worker entry chunk worker-layout-l1.js');
    const starting = run({ 'assets/index-x1.js': 'new Worker(new URL("/assets/worker-compute-k1.js",import.meta.url),{type:"module"})' });
    expect(starting.status).toBe(0);
  });

  it('fails on a source map file or a sourceMappingURL comment (2026-10-13, 5.10a review)', () => {
    const file = run({ 'assets/index-x1.js.map': '{}' });
    expect(file.status).toBe(1);
    expect(file.out).toContain('FAIL assets/index-x1.js.map: is a source map');
    const comment = run({ 'assets/index-x1.js': 'console.log("app")\n//# sourceMappingURL=index-x1.js.map' });
    expect(comment.status).toBe(1);
    expect(comment.out).toContain('has a sourceMappingURL comment');
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

  it('hosting files (release preview, rule 9): a good _headers and robots.txt pass', () => {
    const { status, out } = run({});
    expect(status).toBe(0);
    expect(out).toContain('hosting: _headers');
    expect(out).toContain('hosting: robots.txt disallows everything');
  });

  it('rule 9 fails when _headers or robots.txt is missing', () => {
    expect(run({ _headers: null }).out).toContain('FAIL _headers: missing');
    expect(run({ 'robots.txt': null }).out).toContain('FAIL robots.txt: missing');
  });

  it('rule 9 fails when the /* policy is not the page policy plus frame-ancestors only', () => {
    const widened = run({ _headers: headers({ page: `${POLICY}; frame-ancestors 'none'; img-src *` }) });
    expect(widened.status).toBe(1);
    expect(widened.out).toContain("FAIL _headers: the /* policy is not the page's <meta> policy plus frame-ancestors 'none'");
    const noAncestors = run({ _headers: headers({ page: POLICY }) });
    expect(noAncestors.out).toContain("the /* policy is not the page's <meta> policy");
    const drifted = run({ 'index.html': page(POLICY.replace("object-src 'none'", "object-src 'self'")) });
    expect(drifted.out).toContain("the /* policy is not the page's <meta> policy");
  });

  it('rule 9 fails without X-Robots-Tag noindex', () => {
    const { status, out } = run({ _headers: headers({ robots: '  X-Robots-Tag: all' }) });
    expect(status).toBe(1);
    expect(out).toContain('the /* rule has no X-Robots-Tag: noindex');
  });

  it('rule 9 fails when the chem worker rule matches no file, another file too, or does not remove the inherited policy', () => {
    const none = run({ _headers: headers({ chemPath: '/assets/worker-chem-zzz.js' }) });
    expect(none.out).toContain('expected exactly one CSP rule matching the chem worker');
    const wide = run({ _headers: headers({ chemPath: '/assets/worker-*.js' }) });
    expect(wide.out).toContain('matches files other than the chem worker: /assets/worker-compute-k1.js');
    const inherited = run({ _headers: headers({ chemFirst: '  X-Frame-Options: DENY' }) });
    expect(inherited.out).toContain('must start with "! Content-Security-Policy"');
  });

  it('rule 9 fails when the chem worker policy differs from the page policy by more than unsafe-eval in script-src (ADR-035)', () => {
    const more = run({ _headers: headers({ chem: `${CHEM_POLICY}; frame-ancestors 'none'; connect-src *` }) });
    expect(more.out).toContain('differs from the page policy by more than');
    const missing = run({ _headers: headers({ chem: `${POLICY}; frame-ancestors 'none'` }) });
    expect(missing.out).toContain('differs from the page policy by more than');
    const elsewhere = run({ _headers: headers({ chem: `${CHEM_POLICY.replace("object-src 'none'", "object-src 'none' 'unsafe-eval'")}; frame-ancestors 'none'` }) });
    expect(elsewhere.out).toContain('differs from the page policy by more than');
    const other = run({ _headers: headers({ extra: "/assets/index-*.js\n  Content-Security-Policy: default-src 'self' 'unsafe-eval'" }) });
    expect(other.out).toContain("allows 'unsafe-eval'");
  });

  it('rule 9 fails when robots.txt does not disallow everything', () => {
    for (const robots of ['User-agent: *\nAllow: /\n', 'User-agent: *\nDisallow: /private\n', 'User-agent: *\nDisallow: /\nAllow: /x\n']) {
      const { status, out } = run({ 'robots.txt': robots });
      expect(status).toBe(1);
      expect(out).toContain('FAIL robots.txt: must be exactly');
    }
  });
});
