# Step 8.5e notes (size rule, second pass; labels set apart; pattern report)

Resume point: section 0 committed (1c4250e). E1 in progress.

## FACTS (E1, real RDKit MinimalLib, @rdkit/rdkit dist in node_modules)
- `fixedFontSize` (SVG units) WORKS in `get_svg_with_highlights`: capital O glyph height 10.2 units at 14, constant at scalingFactor 20/37/60
  (bond 29/54/89 units); without it the glyph grows 8.7 -> 15.9 with the bond. Glyph height = 0.73 x fixedFontSize.
- So label on screen = fixedFontSize x (shown bond px / 54). Set `fixedFontSize = 13 / 0.73 x 54 / bondPx` for a 13 px glyph at any standard.
- CONFLICT (kept from 8.5d): a 13 px label shrunk to the 70 % floor is 9.1 px, under 11. A CSS shrink scales labels. The only exact fix is a redraw
  at the shrunk bond length (two-phase, many keys) which the +300 byte limit does not allow. Chosen: labels 13 px at the standard; the shrink floor
  is raised to 11/13 = 0.85 so labels never go under 11 px. REVIEW REQUIRED.
