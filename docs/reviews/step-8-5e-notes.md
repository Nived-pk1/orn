# Step 8.5e notes (size rule, second pass; labels set apart; pattern report)

Resume point: section 0 committed (1c4250e). E1 in progress.

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
