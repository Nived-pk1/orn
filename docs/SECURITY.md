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
- User SVG assets are displayed only via `<img>` with blob URLs (scripts do not run in image context); they are never inlined.
- URLs: only `http(s)` without credentials (`SafeUrlSchema`), rendered as links with `rel="noopener noreferrer"` and `target="_blank"`, and never used to load resources.
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
`'wasm-unsafe-eval'` is required by RDKit.js. Zod must run with `z.config({ jitless: true })` (set once in `src/app/main.tsx` in Phase 5) because its JIT uses `new Function`. Fonts are bundled (no Google Fonts). The app makes no network requests at runtime.

## 5. Delivery

Serve over `http(s)` (static hosting or `npm run preview`); `file://` is unsupported because module workers, WASM and IndexedDB origins require it. A PWA service worker (Phase 9) caches the app shell for offline use.
