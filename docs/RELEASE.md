# RELEASE - the two hosted editions

There are two sites from one repo, both static: the production build served by Cloudflare Workers static assets. There is no Worker script, no
server code, no database and no account system in the app. Everything a visitor does stays in their browser (IndexedDB).

| | Study (public) | Studio (owner only) |
|---|---|---|
| What it is | the study site: no editing code at all (ADR-041) | the same app plus the editors; "Studio" marker, page title "ORN Studio" |
| Worker | `reaction-navigator` (today's URL) | `reaction-navigator-studio` |
| Config | `wrangler.jsonc` | `wrangler.studio.jsonc` |
| Build folder | `dist/` | `dist-studio/` |
| Build | `npm run build` (= `npm run build:study`) | `npm run build:studio` |
| Local preview | `npm run preview` (http://127.0.0.1:4173) | `npm run preview:studio` |
| Deploy | `npm run deploy:study` | `npm run deploy:studio` |
| Who may open it | everyone | only whom Cloudflare Access lets in (set in the dashboard, below) |

`wrangler` 4.151.0 is a dev dependency only; it is never shipped (docs/DEPENDENCIES.md). Headers and robots: `public/_headers` and
`public/robots.txt`, which Vite copies into each build folder (the same files for both editions).

## Build and check

1. `npm run check` is green and the change is committed.
2. `npm run build:smoke` builds BOTH editions and checks each one: `scripts/check-build.mjs` (CSP, workers, WASM, no eval, the demo or
   published dataset, lazy chunks, the `_headers` rules, `robots.txt`) and `scripts/check-edition.mjs` (the Study build contains NO editor
   module in any chunk, from the build's own module list `build-report/<edition>.json`; the Studio build contains them; both print the initial
   JS gzip, and Studio must stay at or under 395 kB). It must pass before anything is deployed.

## Deploy again

1. `npx wrangler login` once per machine (a browser opens: choose Sign in with Google and click Allow).
2. Study: `npm run build`, then `npm run deploy:study`. Studio: `npm run build:studio`, then `npm run deploy:studio`. Each prints its URL. The
   URLs do not change between deploys.
3. Check Study: `curl -sI <url>/` and one `/assets/...` file and the chem worker file; then
   `ORN_BASE_URL=<url> npx playwright test tests/e2e/smoke.spec.ts tests/e2e/csp.spec.ts tests/e2e/phone.spec.ts`, and
   `tests/e2e/study-edition.spec.ts` (no editing UI on the live site). The live spec list, run by EXACT file names, one command per
   browser: smoke, csp, phone, phone-family, equation, phone-equation, structures, study-edition, study-explorers, reaction-explorer,
   precursor-explorer, and since step 7.3b `chapters.spec.ts` (the Chapters view on the live Study site).
4. Check Studio, EVERY time (see "Access" below): an unauthenticated request must NOT get the app.
5. Every row close deploys BOTH editions, Study first, then Studio, and re-runs the live Access check (below) after EACH Studio deploy.
   Record both Worker versions in `docs/PROJECT_STATE.json` (`releasePreview` for Study, `studioPreview` for Studio). Any failure in the
   full e2e run means NO deploy until the reviewer approves, even after a fix.

Never rename either Worker (`name` in the config file) and never change a URL: a new name is a new site at a new address, and the old address
would keep serving the old build until it is deleted by hand.

Try it locally first: `npm run build`, then `npx wrangler dev` (http://127.0.0.1:8787) serves `dist/` with the same `_headers`; for Studio
`npx wrangler dev -c wrangler.studio.jsonc`.

## Access (Studio)

Studio is protected by Cloudflare Access in front of the Worker; the app holds no secret and checks no identity. The user does every dashboard
step (nothing here needs credentials beyond the `wrangler` login), once:

1. Cloudflare dashboard, Zero Trust, Access: add an Access policy to the Worker `reaction-navigator-studio` ONLY, allowing the owner's
   sign-in (an email one-time PIN or the Google account; the address is typed in the dashboard and is never written into this repo). Access
   covers the Worker's workers.dev address, its routes, custom domains and preview URLs, and is enforced before a request reaches the Worker
   (a static-assets-only Worker too).
2. NEVER attach a policy to "all Workers" and never to `reaction-navigator`: the public site must stay public.

After EVERY Studio deploy, check it:
`curl -sI https://reaction-navigator-studio.<account>.workers.dev/` must answer a redirect to a `cloudflareaccess.com` sign-in (or 401 / 403),
never the app (no `200` with the app's HTML); and `curl -sI https://reaction-navigator.<account>.workers.dev/` must still answer `200`.

## Publishing a dataset (first version: no server, no Publish button)

The Study site ships ONE dataset: the published one if there is one, else the bundled demo. Publishing goes only through the repo.

1. In Studio, export the data you want to publish: `.orn.json` with the pictures embedded ("Inside the file"), or an `.ornpkg`.
2. `npm run publish:dataset -- <file>`. It runs the SAME import pipeline in Node (parse, envelope, L1-L3 validation, assets with magic bytes
   and SHA-256), refuses on any L1 ERROR or any rejected asset or a missing file, prints the counts and the findings, then copies the file to
   `data/published/` (`dataset.orn.json` or `dataset.ornpkg`) with `manifest.json` (`sha256`, `publishedAt`, record counts). A refusal writes nothing
   and leaves the previous dataset as it was. `ORN_NOW` (an ISO time) sets the published time for a repeatable manifest.
3. Commit `data/published/`, `npm run build:smoke`, then `npm run deploy:study`.
4. A visitor's first run offers "Load the study dataset" (the demo words when nothing is published). A visitor who loaded an earlier version
   is told at their next visit: "A newer version of the study dataset is available. Load it ..." with "Load it" (the existing replace import,
   with its pre-import snapshot and Undo import) and "Later" (asked again next visit). Studio NEVER shows this notice: the owner's working
   copy is never replaced by a prompt.

## Take it down

`npx wrangler delete` removes the Study site; `npx wrangler delete -c wrangler.studio.jsonc` removes Studio. Nothing else holds data: the
visitors' data is in their own browsers and is not touched.

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
account. Whoever can sign in can deploy or delete either site and change the Access policy.

## Backup (GitHub, private)

The remote `origin` is the private repository https://github.com/Nived-pk1/orn.git. At the END of every step, after its last
commit, run `git push origin master` and `git push origin --tags`. Never force-push. The repository stays private: the source
must not be public.
