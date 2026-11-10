# Step 8.4e notes (map + side panel to the reference, full map, phone landscape)

Resume rule: read this file first; it says where to resume.

## START (2026-11-10)
- HEAD at start: 3395286 (clean, stash empty).
- Speed check (5e7 loop): 235 ms (start).
- Size limits (initial JS gzip bytes, `node scripts/initial-js-size.mjs`): Study <= 383,270; Studio <= 387,150.
- Size baseline measured now from the existing dist / dist-studio: Study 383,020; Studio 386,902.
  (dist built at 8.4d close; rebuild before Part G to be sure.)

## Done
- H1 prettier frame.spec.ts (7e7c510-ish: `7e6a058`). H2 script `scripts/initial-js-size.mjs` + test (6b3f507; the
  script was written together with its test, not red first: it is a new tool with no prior behaviour). H3 PROGRESS 1100 (6b3f507).

## Where to resume
Part 0 (fact sheet).

## Part 0 fact sheet (PARTIAL: items 2, 4, 6, 7(part) answered; 1, 3, 5, 8 NOT done)
Measured with a throwaway probe (kept as docs/reviews/step-8-4e-part0-probe.spec.ts.txt; raw numbers in
step-8-4e-part0-probe.jsonl; pictures in screenshots/part0-8.4e/). Fixture: tests/fixtures/map-layout (20 families),
Studio build, Chromium. Speed check: 235 ms at start (not repeated before the probe run).

2. THE BLANK BAND. Phone portrait (Pixel 7 412x839, iPhone 14 390x664): `styles.lineRow` in navigator-canvas.tsx
   (~line 319) holds `<p class=quiet aria-hidden>`; it keeps its height when empty. Measured: quiet line y=147, h=47
   (hint shown); with a family selected the p is aria-hidden and the row keeps the space; transparent background.
   On top of it Fit keeps FIT_TOP_PADDING = 44 (world translate y=44), so the strip in the screenshot is lineRow (47)
   plus that 44. Stack above the map: header 45, notices row 41, phone bar 61, lineRow 47, map area at y=199
   (Pixel 540 of 839 = 64%; iPhone 365 of 664 = 55%).
   Desktop: no band; `.corner` (pointer-events none, white 85%) sits inside the map area, h 28 (hint) / 32 (selected).
   Dark border in inspector-arrow-1280x800.png: the UA focus ring on `svg[role=group]` after a click focuses the canvas:
   computed `outline: rgb(16,16,16) auto 5px`. The canvas has no token focus rule.
4. PHONE ZOOM TODAY. Both phones, portrait: scale 0.3775 = FIT_FLOOR; box title about 8 CSS px; 12 of 20 boxes on
   screen (about 5 columns, 4 rows); boxes use 251 px of the map area: 46% (Pixel) / 69% (iPhone). Landscape with the
   sheet open: map area 113 px (Pixel) / 91 px (iPhone) high, one row visible. The reviewer's numbers are confirmed.
6. `public/_headers`: `Permissions-Policy: camera=(), microphone=(), geolocation=()`: no fullscreen directive, so
   fullscreen is allowed. Not changed.
7. (part) Portrait: top bar 45, notices row 41, tab bar 56. Desktop 1280x800: header 44, toolbar 41, footer 24,
   map area 1112x643 shut, 712x643 with the inspector (titles 12 px shut, 8 px open).
   NOT measured: breakpoints, media queries and hooks that decide the phone layout.
Other: navigator-canvas.tsx is 395 lines (limit 400): Part A must split it first.

## Where to resume
Finish Part 0 items 1, 3, 5, 7 (breakpoints), 8 (no e2e project sets reduced motion; shell.spec and phone-inspector
use emulateMedia), then Part A. No file under src/ was changed so far.
