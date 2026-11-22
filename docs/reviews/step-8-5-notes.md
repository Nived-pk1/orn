# Step 8.5 notes (arrow-pushing drawings, ADR-038)

Resume point: START done; FACTS next.

## Size check (START)
Fresh builds (2026-11-22, HEAD d62575f): Study 338,360 bytes gzip, Studio 342,382 (`node scripts/initial-js-size.mjs`,
and `check-build.mjs dist ... study` / `dist-studio ... studio` print the same two numbers: 338.36 / 342.38 kB).
The step T "342.39 twice" was NOT reproduced: both scripts read the folder they are given and the two
editions differ by 4 kB. Probable cause: a stale or interrupted smoke at the T close (not provable now). No script fix needed.
Base sizes for this step: Study 338,360; Studio 342,382. Hard limit +100 bytes each.

## FACTS (partial; STOPPED at D1 as the prompt orders)
- Depiction path: `StructureToolkit.depict` (src/chem/contracts.ts:92-118) returns `{key, svg (sanitised text), width, height}` only;
  no coordinates. Drawing: src/chem/rdkit/draw.ts. With `showAtomMaps: false` and a mapped structure, `drawMol` (draw.ts:63-76)
  REDRAWS from the canonical SMILES with `:n` stripped, so the drawn layout is RDKit's own fresh 2D layout of the stripped SMILES.
- RDKit 2026.03.6 MinimalLib (node_modules/@rdkit/rdkit/dist/RDKit_minimal.d.ts): a mol from SMILES has NO conformer
  (get_json shows no coordinates); the 2D layout exists only inside the drawer during `get_svg_with_highlights`. The API has
  `set_new_coords()` / `get_new_coords()` (a molblock with fresh coordinates, in molecule units) but nothing returns the drawer's
  molecule-to-SVG transform (scale, offset, label-widened extents). `get_coords` is in the d.ts but is not a function on a mol.
- So D1 as written (coordinates from the same 2D coordinates RDKit draws, never by parsing the SVG) is NOT available.
