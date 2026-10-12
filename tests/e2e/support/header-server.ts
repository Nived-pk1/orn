/**
 * A small static server for dist/ that sends the SECURITY §4 policy as a response HEADER (step 5.10a, part 2). node:http only.
 * `vite preview` cannot do this: the app's own policy is a <meta> tag, which a browser does not apply to a dedicated worker. A host that
 * sends the header does apply it to workers, so this serves the build the way such a host would.
 *  - "same": the same policy header on every response (documents, scripts, the chem worker entry, wasm, json, css, fonts).
 *  - "chem-allowance": identical, except the chem worker entry's response (`worker-chem-<hash>.js`) gets `'unsafe-eval'` added to
 *    script-src. The page policy is never widened.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

export type HeaderCase = 'same' | 'chem-allowance';

export interface HeaderServer {
  readonly origin: string;
  /** Every URL path served, with the policy header that went with it. */
  readonly served: { readonly path: string; readonly csp: string }[];
  close(): Promise<void>;
}

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/** The policy as SECURITY.md §4 states it (the first backticked `default-src ...`): the doc is the one source, as in the build check. */
export function pagePolicy(root = process.cwd()): string {
  const doc = readFileSync(join(root, 'docs', 'SECURITY.md'), 'utf8');
  const section = doc.slice(doc.search(/^## 4\./m));
  const found = /`(default-src[^`]*)`/.exec(section)?.[1];
  if (found === undefined) throw new Error('docs/SECURITY.md section 4 has no policy');
  return found;
}

export const withUnsafeEval = (policy: string): string => policy.replace("script-src 'self' 'wasm-unsafe-eval'", "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'");

export const isChemWorkerEntry = (path: string): boolean => /^\/assets\/worker-chem-[\w-]+\.js$/.test(path);

export async function startHeaderServer(kind: HeaderCase, root = process.cwd()): Promise<HeaderServer> {
  const dist = resolve(root, 'dist');
  const policy = pagePolicy(root);
  const allowance = withUnsafeEval(policy);
  if (allowance === policy) throw new Error("the page policy's script-src is not the expected one");
  const served: HeaderServer['served'] = [];
  const server: Server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
    const file = path === '/' ? join(dist, 'index.html') : normalize(join(dist, path));
    if (!file.startsWith(dist + sep) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    const csp = kind === 'chem-allowance' && isChemWorkerEntry(path) ? allowance : policy;
    (served as { path: string; csp: string }[]).push({ path, csp });
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-security-policy': csp, 'cache-control': 'no-store' });
    createReadStream(file).pipe(response);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    served,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}
