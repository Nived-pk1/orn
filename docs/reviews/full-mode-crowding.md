# Full mode crowding sweep on the owner's exported data (step 8.5g B3, 2026-11-26; report only, no data edits)

Source: `..\fable-work\inputs\ORN-real-data-2026-11-24.orn.json`. Every species was drawn in mode Full at the family card's Full standard
(`bondPx` 39) with the same toolkit and crowding check the app's chem worker runs, in a throwaway Node test over the file (not through a
Studio window; nothing was imported anywhere).

## Counts

- Species: 622 (all have a structure). Clean in Full: 619. Fallen back to condensed: 3. Not drawn: 0.
- Whole sweep: about 1.1 s; slowest single species 56 ms.

## Fallbacks (id, name, SMILES)

- spc_hexamethylenetetramine | Hexamethylenetetramine | `C1N2CN3CN1CN(C2)C3`
- spc_magnesium-bromide | Magnesium bromide | `[Mg+2].[Br-].[Br-]` | its condensed drawing also has 1 label overlap
- spc_zinc-iodide | Zinc iodide | `[Zn+2].[I-].[I-]` | its condensed drawing also has 1 label overlap

## Notes for the reviewer

- The two salts have no hydrogens: their Full, Condensed and Skeletal drawings are the same picture, with two ion labels touching. The card
  still says "Too crowded with all atoms; shown condensed", as the rule is written.
- A fallback is not itself checked: for a molecule too crowded even when condensed, the condensed drawing is shown as it is.
