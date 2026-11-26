# Step 8.5f notes: dark mode, structure drawings back on the paper surface (2026-11-26)

## Facts

- **(a) The wrapper and the token.** `src/render/svg/depiction-surface.tsx:5` (`DepictionSurface`), CSS `depiction-surface.module.css:9`
  (`background: var(--depiction-bg)`). Tokens `src/ui/design/tokens.css`: `--depiction-bg:transparent` in light (line 31), `var(--paper)` in
  both dark blocks (lines 83 and 134).
- **(b) Boxes without it.** Only `Structure` (`src/features/navigator/family-structure.tsx`), whose box was painted
  `var(--color-paper)` (`family-scheme.module.css:29`), an alias of `--surface`: the dark card colour. The open-box button and the scroll box
  are this same box; its fade (`mask-image`, line 36) therefore faded into the card.
- **(c) Breaking commit.** `7cd0488` (phase-8.5d): `family-page.tsx`, `reaction-card-host.tsx` and `substance-host.tsx` changed from
  `depictionBindingOf` (RDKit drawing with its own white canvas) to `equationBindingOf` (fixed scale, `clearBackground: false`,
  `src/chem/rdkit/draw.ts:36`: transparent), without adding the wrapper. Shown by the commit's diff; no build bisect.
- **(d) Every place, in dark, on START.**
  - Wrong (all are `Structure` boxes): family page cards, Reactions list cards, named-reaction page, reagent page, chapter page, mechanism
    view's reaction cards, Precursors "made directly from" and From A to B chain cards.
  - Right: full equation and inspector hero (`term-view.tsx:72`, wrapper); mechanism step SVG (`step-drawing.module.css:14`, same token).
  - No `data-bond-px`, own opaque RDKit white canvas, readable, unchanged: compound inspector (`features/inspector/depiction.tsx`), editor
    structure panel, duplicate dialog.
  - Reactions compact list: no drawings.
  - Uploaded pictures (record picture, full size, asset image, editor thumbnail and dialog preview): painted `--color-surface` /
    `--color-paper` or nothing, so a transparent line drawing would vanish in dark. Found by reading the CSS, not by a picture.

## Fix

- `Structure`: a box holding a drawing is wrapped in `DepictionSurface`, outside the box, so the scroll box's fade goes into the paper. A
  text-formula box is not wrapped. New token `--depiction-box` (`--surface` in light, `transparent` in dark): light is as before.
- Uploaded pictures: `var(--depiction-bg)` layered over their old background (CSS only; the token, not a second colour).

## RED

`npx playwright test --project=chromium tests/e2e/paper-surfaces.spec.ts` (2026-11-26 12:01): dark desktop and dark Pixel 7 failed (every
failure a card box, contrast 1.19 on `rgb(22, 25, 31)`), both light runs passed.
`npx vitest run src/render/svg/depiction-surface.test.tsx` (12:02): the uploaded-pictures test failed (`recordPicture`).
