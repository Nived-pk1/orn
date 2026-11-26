# Mechanisms survey on the owner's exported data (step 8.5g G4, 2026-11-26; report only, no data edits)

Source: `..\fable-work\inputs\ORN-real-data-2026-11-24.orn.json`, imported into a throwaway local Studio (preview build, a fresh browser
profile; never the owner's live Studio).

## Counts

- Mechanisms: 3. Steps: 10. Drawn: 6. Not drawn: 4.
- "No drawing: this step has no atom-mapped structures.": 3.
- "No drawing: an electron movement names an atom that is not in this step's structures.": 1.
- Drawn steps in a scroll box at 1280 x 800: 0.

## Steps that do not draw

- Aldol addition of ethanal, Step 3 "Alkoxide is protonated by water" (first variant): movement names an atom. Cause: map 10 is written on
  BOTH `[H:9][OH:10]` (role reagent) and `[OH-:10]` "Hydroxide (regenerated)" (role catalyst). A catalyst is drawn BEFORE, so the before
  side holds map 10 twice. In the bundled demo the regenerated hydroxide has role product and the step draws. A content matter (the
  role); the sides rule and this refusal are unchanged by 8.5g.
- Aldol addition of ethanal, Step 1 "Carbonyl oxygen is protonated" (acid variant): no atom-mapped structures.
- Aldol addition of ethanal, Step 2 "Enol forms by loss of an α-hydrogen": no atom-mapped structures.
- Aldol addition of ethanal, Step 4 "Loss of H⁺ gives the aldol": no atom-mapped structures.

## Drawn steps looked at (all 6; `screenshots/8.5g/real-*.png`, desktop light)

- `real-1-1` (aldol, hydroxide takes the alpha-H): HO- reaches the H from the left; the other two arrows sit on their bonds. Nothing
  crosses a molecule or hides a label.
- `real-1-2` (enolate attacks ethanal): C=C to carbonyl carbon, O- to bond, C=O to O. Right places. The arrow into the carbon passes close
  to the "+". The product is turned to follow the skeleton.
- `real-1-6` (enol attacks protonated ethanal): the three arrows are right. The arrow onto "HO+" ends beside the label without covering it.
- `real-2-1` (E2, more substituted): the three arrows are right; but-2-ene is a plain double bond. Nothing hidden.
- `real-2-2` (E2, less hindered): right; the arrow to Br ends under the label, clear of it.
- `real-3-1` (SN2): hydroxide arrives from the side opposite Br. Right; nothing hidden.
