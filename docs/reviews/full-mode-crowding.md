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

## Recount with the crossing-bond rule (step 8.5h B3, 2026-11-28; report only, no data edits, no rule change)

Same file, same method (throwaway Node test over the file with the chem worker's own toolkit, Full, `bondPx` 39). The check now also fails
a drawing in which two bonds that share no atom cross (8.5h A3).

- Species: 622. Clean in Full: 618. Fallen back to condensed: 4 (was 3). Not drawn: 0. Whole sweep about 1.2 s; slowest 59 ms.

Fallbacks (id, name, SMILES; what failed in Full; what the condensed drawing shown instead still has):

- spc_hexamethylenetetramine | Hexamethylenetetramine | `C1N2CN3CN1CN(C2)C3` | Full: 1 label on a bond, 5 crossings | condensed: 1 crossing (a cage)
- spc_magnesium-bromide | Magnesium bromide | `[Mg+2].[Br-].[Br-]` | Full: 1 label overlap | condensed: the same picture
- spc_phosphorus-pentoxide | Phosphorus pentoxide | `O=P12OP3(=O)OP(=O)(O1)OP(=O)(O2)O3` | NEW. Full: 1 crossing only (a cage) | condensed: 2 labels on bonds, 1 label overlap
- spc_zinc-iodide | Zinc iodide | `[Zn+2].[I-].[I-]` | Full: 1 label overlap | condensed: the same picture

For P4O10 the drawing shown after the fallback is worse than the one the rule refused: it has no hydrogens, so nothing is gained by
falling back, and RDKit's flat layout puts labels on bonds. For the 8.7 list, with the two salts: no fallback when condensed does not help.
