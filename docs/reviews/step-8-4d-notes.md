# Step 8.4d notes (design language and app frame) — resume file

Start: HEAD e0ddf47 + reference commit 2296ced; tree clean; no stashes. Speed (`node -e`, ms): 0 (2026-11-08).
Reference screenshots: screenshots/reference-light.png, reference-dark.png (1280 x 6733; Playwright full page, Chromium).

## Part 0 fact sheet
1. Tokens: `src/ui/design/tokens.css` (8.4a names: `--color-paper/surface/ink/ink-2/rule/accent/warning/error/review/on-accent/hover/scrim`,
   21 `--color-tone-*`, `--font-sans/mono`, `--text-12..32`, `--space-4..48`, `--radius-4/8/pill`, `--motion-fast/slow`, `--hit-min`,
   `--focus-ring-*`). Raw colours only there (scripts/check-colours.mjs, part of `npm run check`). No dark theme.
2. Fonts: "IBM Plex Sans/Mono" named in `--font-*` with system fallbacks; NO @font-face anywhere (no self-hosted files): system
   fallback is what renders. Kept as is (reference says keep).
3. Icons: `src/ui/primitives/icons.tsx`, 16 inline-SVG paths (16 px box, stroke 1.5). Text glyphs elsewhere (☰, ›, ↻).
4. Palette: `src/features/search/palette.tsx` (cmdk inside native Dialog), lazy via `src/app/window/lazy-palette.tsx`; opened by Ctrl/Cmd K
   (window.tsx keydown) and the top bar Search icon; lists search hits, recent searches, and `>` commands (palette-commands.ts).
5. Header/rail/status: `src/ui/shell/shell.tsx` (+ mode-rail.tsx, shell.module.css 399 lines), top controls `src/app/window/top-bar.tsx`,
   notice band `src/app/window/notice-band*.tsx`, toast `src/ui/primitives/toast.tsx`, banner.tsx; tests shell*.test.tsx, top-bar.test.tsx.
6. Breadcrumb inputs: active mode id + MODES labels (modes.ts); record name lives in navigator/inspector stores (to be read in Part C).
7. Boot: `main.tsx` awaits `createAppServices` (reads uiState via bootReport) BEFORE `createRoot().render`; panels store is created
   from the boot report first. So a stored theme can be applied before first paint with no localStorage (8.4f).

## Part A red line (before any source touched)
`npx vitest run src/ui/design/tokens-v2.test.ts` -> `Tests 6 failed | 4 passed (10)` (no theme blocks in tokens.css, no
`--d-*`/`--s-*`/`--r-*` names, index.html has no data-theme, base.css focus ring is an outline, not `--focus`).

## Part A done
Tokens v2: tokens.css regenerated from the reference blocks (light + dark, copied verbatim; `data-theme="light"` in index.html).
8.4a names kept as aliases (`--color-paper` -> `--surface`, `--color-surface` -> `--canvas`, `--color-ink` -> `--text`, `--color-rule` ->
`--line-strong`, ...). App extras in both themes: `--success-ink/--warning-ink/--danger-ink/--review-violet` (the reference role
colours fail 4.5:1 as small text on white: warning 3.98, success 4.34) and the 7 family tones (dark values solid hex).
One global focus ring (`:focus-visible { box-shadow: var(--focus) }`) in base.css; body on `--canvas`.
GREEN: tokens-v2.test.ts 10/10; tokens.test.ts 74 pass (changed: stated-value test now pins the alias mapping; reduced-motion test
also covers `--d-*`; contrast pairs read the resolved aliases; added dark-theme pairs).
Reference gap: `--text-3` is 3.3:1 on white (light) and 4.05:1 on surface (dark): used for icons, hints and separators only, never for
text that carries meaning (dark `text-3 on surface` pair left out of the test on purpose; REVIEW REQUIRED).
