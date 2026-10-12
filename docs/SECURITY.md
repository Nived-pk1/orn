# Security

Package section **#21 Security**. ORN is offline-first and single-user, so the threat model is **hostile or corrupted data** (imported files, pasted text, legacy exports, images) rather than a network attacker.

## 1. Threat model

| Threat | Vector | Mitigation |
|---|---|---|
| Script injection | names, notes, SVG images, depictions, URLs in imported data | §2 rendering rules, CSP §4 |
| Denial of service | huge files, deep JSON, giant strings, 100k-node graphs, pathological SMILES | §3 caps, worker isolation, cancellation, bounded traversal |
| Prototype pollution | `__proto__`/`constructor` keys in JSON | safe parser renames keys (PERSISTENCE.md §7); strict schemas |
| Spoofing | bidi overrides and control characters in names | rejected by text schemas |
| Data loss by bad import | malformed or malicious files | preview, quarantine, snapshots, atomic apply (INV-21) |
| Supply chain | dependencies | pinned lockfile, `npm audit` in CI, minimal runtime deps, no CDN at runtime |

## 2. Rendering rules

- Data is rendered only as **text nodes** (React escaping) or through the mini-markup AST → React elements. `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `dangerouslySetInnerHTML`, `document.write`, `eval` and `new Function` are banned by ESLint.
- Structure depictions (RDKit SVG) are sanitised in the chem worker (only a whitelist of SVG elements/attributes; no `script`, `foreignObject`, event handlers, external references) and displayed via `<img src>`/SVG `<image href>` with data or blob URLs — never inlined into the DOM.
- **The depiction sanitiser** (`src/chem/svg`, step 4.3a) is a pure string tokenizer (workers have no DOMParser) that WRITES its output from whitelisted parts with escaping, never copying input markup. Kept: `svg g path rect circle ellipse line polyline polygon text tspan` and their whitelisted attributes (geometry, colours, lengths, path data, `class`, `transform`) with values that pass a per-attribute pattern; `style` only declaration by declaration for whitelisted properties with safe values, and refused whole if it contains `url(`, `expression`, `@`, a backslash or `<` (raw or written as a numeric reference). Dropped and counted in a report: comments, CDATA, the XML declaration and processing instructions, `metadata` and every element outside the whitelist WITH its content, namespaced elements, `xmlns:*`/`xml:*`/`xlink:*`/`href`/`on*` and any attribute outside the whitelist. Refused as a value: an input over 2 MiB, any `<!DOCTYPE` or other `<!` declaration (so no entity is ever defined; only the five predefined entities and numeric references decode), nesting deeper than 256, no `svg` root. The output always carries its own `xmlns`, is idempotent, and no output string contains a reference, a script scheme, an expression or a handler in any case. `depict` always returns sanitised SVG or a failure value; nothing else leaves the chem worker as markup.
- User SVG assets are displayed only via `<img>` with blob URLs (scripts do not run in image context); they are never inlined.
- URLs: only `http(s)` without credentials (`SafeUrlSchema`), rendered as links with `rel="noopener noreferrer"` and `target="_blank"`, and never used to load resources. `SafeUrlSchema` also rejects control and bidi-override characters (the URL parser would otherwise normalise them away while the raw string is stored). Embedded asset base64 (`Base64Schema`) must be standard-alphabet, padded, with length a multiple of 4.
- The SVG/PNG export serialises the Scene through a builder that escapes text; no raw data is concatenated into markup.

## 3. Caps

| Item | Cap |
|---|---|
| JSON import | 50 MB, depth 64, 200k records, strings 1 MB |
| Package import | 200 MB |
| Asset | 20 MB, magic bytes must match media type, SHA-256 verified |
| Name / label / short / rich text | 300 / 200 / 2,000 / 50,000 characters |
| SMILES / CXSMILES | 20,000 characters; molfile 1 MB |
| Arrays | per-field caps in `LIMITS` (`src/core/schema/primitives.ts`) |
| Traversal | depth 12, 400 nodes, 800 edges per projection by default; time budgets |
| Chem parse | per-call timeout 2 s in the worker; worker restarted if unresponsive |

## 4. Content-Security-Policy

Injected into production builds by `vite.config.ts`:
`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' blob: data:; style-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`.
`'wasm-unsafe-eval'` is required by RDKit.js. **ADR-035 (reviewer decision, step 4.3a review):** the page policy is exactly the one above, with no `'unsafe-eval'` anywhere on the page. RDKit's JS glue calls `new Function` in two places (Emscripten embind; no `eval`), which `'wasm-unsafe-eval'` does not allow; that is accepted **only inside the chem worker** (no DOM, no storage, never from data). Our own code keeps the ESLint ban. A policy delivered as a `<meta>` tag (as `vite.config.ts` does) is not applied to a dedicated worker; if a host ever applies a header CSP to workers, the chem worker script alone gets a policy that allows it, never the page. The 4.6 build smoke fails if `new Function`, `Function(` or `eval(` appears in any built chunk other than RDKit's own; Phase 5 (Gate E e2e) proves in a real browser that the page CSP is enforced and the chem worker still starts. Zod must run with `z.config({ jitless: true })` (its JIT uses `new Function`): every worker entry imports `src/workers/zod-jitless.ts` first, and the page sets it once in `src/app/main.tsx` in Phase 5. Fonts are bundled (no Google Fonts). The app makes no network requests at runtime.

`npm run build:smoke` (step 4.6, `scripts/check-build.mjs`) checks the built `index.html` against the policy above, exactly, and fails the build if `eval(`, `new Function` or `Function(` appears in any JS chunk other than RDKit's glue chunk (`rdkit-glue-<hash>.js`), which only the chem worker may load. It checks files, not browser behaviour: that is a Phase 5 (Gate E) e2e.

**Proved in a browser (2026-10-12, step 5.10a, `tests/e2e/csp.spec.ts`, Chromium, Firefox and WebKit).** Against the production build with the `<meta>` policy: an injected inline script, an inline event handler and a script from a `blob:` URL do not run and raise `securitypolicyviolation`; the chem worker still starts, parses and draws a structure. (`eval` is not asked in a test: Playwright's own evaluate is exempt from the page policy in every engine; the build check covers it.) Served as a response HEADER by `tests/e2e/support/header-server.ts` (node:http, serving `dist/`): case A, the page policy on every response including the chem worker entry: the app works, the page policy is enforced, the compute, layout and search workers run, the chem worker runs but RDKit cannot start (its glue calls `new Function`), so the app says "Check unavailable" with Retry and never CHEM-001, in all three engines. Case B, the same, except the chem worker entry's response (`worker-chem-<hash>.js`) alone has `'unsafe-eval'` added to script-src: chem works, a structure is drawn and L4 runs, in all three engines. The page policy was never widened.

What a host that sends a header policy must send, as plain lines:
- the page policy of this section, as a header, on every response (document, scripts, workers, wasm, json, css, fonts);
- on the chem worker entry's response alone (`/assets/worker-chem-<hash>.js`), the same policy with `'unsafe-eval'` added to script-src;
- no `'unsafe-eval'` on any other response. No host configuration file is shipped.

## 5. Delivery

Serve over `http(s)` (static hosting or `npm run preview`); `file://` is unsupported because module workers, WASM and IndexedDB origins require it. A PWA service worker (Phase 9) caches the app shell for offline use. A host that adds a header policy follows the plain lines at the end of §4 (2026-10-12): the page policy everywhere, the chem worker entry alone with `'unsafe-eval'` added.
