# RELEASE - the hosted preview

The preview is a static site: the production build in `dist/`, served by Cloudflare Workers static assets. There is no Worker script, no
server code, no database and no account system. Everything the visitor does stays in their browser (IndexedDB). Config: `wrangler.jsonc`
(project name `reaction-navigator`, assets directory `./dist`). Headers and robots: `public/_headers` and `public/robots.txt`, which
Vite copies into `dist/`. `wrangler` 4.151.0 is a dev dependency only; it is never shipped (docs/DEPENDENCIES.md).

## Deploy again

1. `npm run check` is green and the change is committed.
2. `npm run build` (this also runs the build smoke, which checks `dist/_headers` and `dist/robots.txt`, rule 9).
3. `npx wrangler login` once per machine (a browser opens: choose Sign in with Google and click Allow).
4. `npx wrangler deploy`. It prints the URL. The URL does not change between deploys.
5. Check it: `curl -sI <url>/` and one `/assets/...` file and the chem worker file; then
   `ORN_BASE_URL=<url> npx playwright test tests/e2e/smoke.spec.ts tests/e2e/csp.spec.ts tests/e2e/phone.spec.ts`.

Never rename the project (`name` in `wrangler.jsonc`) and never change the URL: a new name is a new site at a new address, and the old
address would keep serving the old build until it is deleted by hand.

Try it locally first: `npm run build`, then `npx wrangler dev` (http://127.0.0.1:8787) serves `dist/` with the same `_headers`.

## Take it down

`npx wrangler delete` removes the site. Nothing else holds data: the visitors' data is in their own browsers and is not touched.

## What each header does

`public/_headers` has three groups of rules.

- `/*` (every response):
  - `Content-Security-Policy`: the page policy of docs/SECURITY.md section 4 plus `frame-ancestors 'none'` (a header-only directive: nobody
    can put the app in a frame). No `'unsafe-eval'`.
  - `X-Robots-Tag: noindex, nofollow`: search engines are asked not to list the preview (with `robots.txt`, which disallows everything).
  - `X-Content-Type-Options: nosniff`: the browser does not guess a file's type.
  - `Referrer-Policy: no-referrer`: no address is sent to other sites.
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`: those features are off.
  - `Cross-Origin-Opener-Policy: same-origin`: the page shares no window group with other sites.
- `/assets/worker-chem-*.js` (the chem worker entry alone): starts with `! Content-Security-Policy`, which removes the policy inherited
  from `/*`, then the same policy with `'unsafe-eval'` added to `script-src` and nothing else. RDKit's glue calls `new Function`, which
  only this worker may do (ADR-035; docs/SECURITY.md section 4).
- `/assets/*` is cached for a year (`immutable`: the file names carry a hash); `/` and `/index.html` are `no-cache`, so a new deploy is
  seen at the next visit.

`scripts/check-build.mjs` (rule 9) fails the build if any of this drifts: the `/*` policy must equal the page's `<meta>` policy plus
`frame-ancestors 'none'`; the chem worker rule must match that one file and no other; no other rule may allow `'unsafe-eval'`.

## The account

The Cloudflare account signs in with Google, so Google 2-Step Verification protects it. Keep 2-Step Verification on for that Google
account. Whoever can sign in can deploy or delete the site.
