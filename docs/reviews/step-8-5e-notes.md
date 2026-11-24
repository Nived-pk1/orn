# Step 8.5e notes (size rule, second pass; labels set apart; pattern report)

Resume point: PAUSED 2026-11-24 before the deploy. See "RESUME HERE" at the end of this file.

## FACTS (E1, real RDKit MinimalLib, @rdkit/rdkit dist in node_modules)
- `fixedFontSize` (SVG units) WORKS in `get_svg_with_highlights`: capital O glyph height 10.2 units at 14, constant at scalingFactor 20/37/60
  (bond 29/54/89 units); without it the glyph grows 8.7 -> 15.9 with the bond. Glyph height = 0.73 x fixedFontSize.
- So label on screen = fixedFontSize x (shown bond px / 54). Set `fixedFontSize = 13 / 0.73 x 54 / bondPx` for a 13 px glyph at any standard.
- CONFLICT (kept from 8.5d): a 13 px label shrunk to the 70 % floor is 9.1 px, under 11. A CSS shrink scales labels. The only exact fix is a redraw
  at the shrunk bond length (two-phase, many keys) which the +300 byte limit does not allow. Chosen: labels 13 px at the standard; the shrink floor
  is raised to 11/13 = 0.85 so labels never go under 11 px. REVIEW REQUIRED.

## STATE (stopped on the size rule)
Committed 1e43f3e (E1, E2 a/b/c, specs). Uncommitted after it: size trims (scene-ports keyOf with bondPx, lighter use-row-scale, naturalRowWidth removed with its test).
SIZE: base (36978cb, fresh Studio build) 343,144; now 343,803 = +659 (limit +300). Trims gave only -31. STOP per the prompt.
Biggest additions in the entry chunk: term-view (context, row scale, bond-px), family-structure (open box button), use-row-scale, size-rule, binding bondPx.
Options for the reviewer: (1) raise the limit, (2) drop E2 b (keyboard/role button), (3) move the equation scheme out of the entry chunk.
NOT DONE: Study fresh size, full e2e rounds (new specs size-rule-extra never run), E3 Firefox, E4 report, screenshots, docs rows, deploy, push.

## RULING (reviewer, after the stop): floor 85 % accepted; limit +800 per edition; trims reverted (fb8a9b5); E2b keeps keyboard and role.
Phase 9 lazy lever: the equation scheme's modules (src/render/equation: scheme, term view, hang, hero-fit, names switch, runs, arrows, size rule, use-facts,
use-row-scale, use-width) are in the ENTRY chunk (build-report/studio.json, 518 modules in the index chunk). Minified separately and gzipped together: about 4,629 bytes
(13,104 bytes minified). Moving them behind the lazy views that draw them would free about that much of the initial JS.


## RESUME HERE (paused 2026-11-24, at the last checkpoint before the deploy)
DONE and committed (HEAD after 496736e plus a docs commit): section 0; E1 (bondPx + fixedFontSize, standards 28/34/40/36, floor 85 %); E2 a/b/c; E3 (test retry of the
first double click in family.spec.ts and equation.spec.ts; cold Firefox loses a double click in the first moments, product cause not found); E4 (docs/reviews/family-patterns-chem007.md,
made by tests/integration/family-patterns-report.test.ts with ORN_E4=1: 124 patterns, 0 refused, (a) 2 compounds in 1 family, (b) 474 compounds in 57 families,
24 families past the Studio's 100-SMARTS cap); the atom-position fix for labels at a fixed font (svg-positions.ts: bonds fix the scale, label centres only without bonds).
Results: npm run check green (854 files, 9,101 tests); full Chromium run 476 passed + serial 31 passed, 0 failed; 3-engine round of 18 spec files: only the E3 Firefox/equation and the mechanism failures,
all fixed and re-run green on all three engines (equation + mechanism-drawing: 19 passed, 1 Firefox first-click race, then fixed).
SIZES: START Study 339,063 / Studio 343,144 (fresh builds of 36978cb). CLOSE Study 339,755 (+692) / Studio 343,856 (+712); limit +800 met.
Standards after looking at the screenshots (screenshots/8.5e, all opened): unchanged 28 / 34 / 40 / 36 (no tuning was needed). Dieckmann reactant ~245 px (limit 320); Pixel 7 sodium propan-2-olate and ethanoic acid acceptance specs pass.
Uncommitted at the pause: docs/IMPLEMENTATION_PLAN.md (rows 8.5d, 8.5e) and docs/PROJECT_STATE.json (next 8.6): committed together with these notes.
LEFT TO DO:
 1. `npm run build:smoke` (was running when paused; run again, must pass) and `npm audit --omit=dev` (report the result).
 2. Write the PROGRESS entry "Step 8.5e" body under the existing reviewer-decision bullet (hashes, FACTS, standards, acceptance numbers, E2/E3/E4, sizes, checks, screenshots, deploy lines, disclosed breaks, REVIEW REQUIRED).
 3. Deploy per docs/RELEASE.md: Study (`npm run build`, `npm run deploy:study`), live specs by EXACT file names in Chromium AND WebKit (smoke, csp, phone, phone-family, equation,
    phone-equation, structures, study-edition, study-explorers, reaction-explorer, precursor-explorer, chapters, reagent-explorer; ORN_BASE_URL=<study url>), then Studio (`npm run build:studio`,
    `npm run deploy:studio`), the Access check (Studio must redirect or 401/403, Study 200), commit the deploy line, `git push`.
 4. Final REPORT as the prompt's REPORT section asks (lines under 100 characters).
Disclosures for the report: tests written after the source for the row-scale hook only partly (naturalRowWidth unit test first; hook has no jsdom test, covered by the e2e); the hero-phone and
mechanism specs were first written with a wrong selector / unmapped SMILES and fixed; E4 was run with the app's own membership code on real RDKit in a vitest (not by clicking in a throwaway Studio) and
for ALL classes (the Studio itself would try only the first 100 per species); no reason contains "~", so "approximate pattern" text was used as the marker; floor 85 % per the reviewer ruling.
REVIEW REQUIRED candidates: the 85 % floor effect (more scroll boxes), E3 cold-Firefox first double click (test-side retry, product cause unknown), CHEM-007 24 families beyond the 100 cap, lazy lever (equation scheme about 4.6 KB gzip in the entry chunk).
Local servers: preview servers on 4173/4174 may still be running (stop by PID: `bash ../T-rebuild.sh` stops and restarts them). Never run a bare Playwright; use ORN_REUSE_SERVERS=1 with them up.
