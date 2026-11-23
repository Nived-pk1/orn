# Step 8.5b notes (arrows on the right atoms; one size rule)

Resume point: Part A done and committed; Part B (FACTS first) next.

## START
HEAD 8727303 (section 0 commit, local, push at the end). Fresh builds: Study 338,422 / Studio 342,438 gzip (8.5 close said 338,435 / 342,431; the
limit is +150 over THESE). Speed check 0.58 s. Section 0: the "unique across all species" comment now says one atom per map number across a step;
no rule (CHEM-008, MEC-*, mapped-hydrogens) assumes per-species uniqueness (grep found none), so nothing else changed.

## A1 data -> drawn (real RDKit, 0386c4f). Maps are the step's own.
| step | movement (data, in words) | drawn target on 0386c4f | same? |
|---|---|---|---|
| aldol-base-1 | lone pair on O1 (hydroxide) -> NEW bond O1-H2 (H2 bonded to C3 in ethanal) | midpoint of O1 and H2 in the gap between the two pictures | NO: should end on H2 |
| | bond H2-C3 -> bond C3-C4 (existing C-C) | midpoint of C3-C4 | yes |
| | bond C4=O5 -> lone pair on O5 | O5's dots | yes (dots beside the label box centre, see A3) |
| aldol-base-2 | lone pair on O5 -> bond C4-O5 | midpoint | yes |
| | bond C3=C4 -> NEW bond C3-C7 (C7 = carbonyl C of ethanal 2) | midpoint of C3 and C7 in the gap | NO: should end on C7 |
| | bond C7=O8 -> lone pair on O8 | O8's dots | yes |
| aldol-base-3 | (see DATA FAULT below) | no drawing | n/a |
| aldol-acid-3 | bond C1=C2 -> NEW bond C1-C5 | midpoint in the gap | NO: should end on C5 |
| | lone pair O3 -> bond C2-O3 ; bond C5=O6 -> lone pair O6 | | yes |
| e2-saytzeff-1, e2-hofmann-1 | lone pair O1 -> NEW bond O1-H2 | midpoint in the gap | NO: should end on H2 |
| | bond H2-C3 -> bond C3-C4 ; bond C4-Br5 -> lone pair on Br5 | | yes |
| sn2-concerted-1 | lone pair O1 -> NEW bond O1-C2 (C2 holds Br3) | midpoint in the gap, at the left end of the substrate picture | NO: should end on C2 |
| | bond C2-Br3 -> lone pair on Br3 | | yes |

VERDICT: the DATA is right (every movement says what a textbook says). The position table is right (map -> atom -> position was checked against the
drawing by the guard test: nearest atom, letter glyph). The CODE was wrong in one place by design: `layoutArrows` ended an arrow at a bond the
step FORMS at the midpoint between its two atoms, which is empty space when the atoms are in two species. No 0/1-based or hydrogen-merge slip.
A second code fault, A3: a labelled atom's position was the centre of its whole label ("HO-", "NH3+"), so dots and arrow ends sat off the letter.

## DATA FAULT (reported, demo NOT edited): mst_aldol-base-3 ("Water" is a reagent and "Hydroxide (regenerated)" has role `catalyst`)
Both go BEFORE (reactant/reagent/catalyst), so atom 10 is held by two before-side species and the step is shown, correctly and in words, as "No
drawing: an electron movement names an atom that is not in this step's structures." Movement 2 is bond O10-H9 -> lone pair on O10. PROPOSED
CORRECTION: role of "Hydroxide (regenerated)" `leaving_group` (or `product`). Alternative (code, needs the reviewer): in `stepSides` a catalyst whose atoms
are all held by another before-side species goes after. Waiting for the reviewer. The guard test pins "No drawing" for this step.

## A2 RED (before the source edits)
`npx vitest run tests/integration/step-arrow-targets.test.ts` on 0386c4f source (svg-positions stashed; arrows.ts unchanged): 8 failed / 7 passed (2.7 s):
"aldol-base-1 movement 1: the arrow end is nearest atom 4, the target is 2", "aldol-base-2 movement 2: ... nearest atom 5, the target is 7",
"aldol-acid-3 movement 1: nearest 3, target 5", "e2-hofmann-1: nearest 4, target 2", "sn2-concerted-1: nearest 1, target 2", "[Br-:1]: map 1 is in a
letter glyph: expected false to be true". arrows.test.ts: the new "forms" test red ("expected 50 to be less than 20"). e2e R1 test red on chromium
(arrow 2 of step 2 not in the second ethanal picture). DISCLOSED: the A3 source edit (svg-positions.ts) was written BEFORE its tests (I then
stashed it to show the red guard test; the unit tests of elementLetterOf cannot be red on the old code because the function did not exist).
The e2e step-1 assertion (arrow end inside the ethanal picture) is also true of the old code (the picture is wide); steps 2 and SN2 carry the red.

## A3 rule (measured RDKit 2026.03 label glyphs)
Letters = tall, wide glyphs (a subscript count, a charge, a dot, the "r" of Br, the "l" of Cl are not). Bonded atom: the letter nearest the end of its
bond. No bond: with a subscript count between two letters the hydrogen is first (H2O), after them it is last (NH2-); with no count RDKit draws the
hydrogen first (HO-, HS-, measured for O and S only: REVIEW REQUIRED if other elements appear). The box of the letter replaces the label box.

## A4 screenshots/8.5b/arrows-* (12 files, desktop and phone, light and dark; opened: aldol 1 desktop light+dark, aldol 2 desktop light + phone dark,
SN2 desktop light + phone light). Arrows end on H2, on the carbonyl carbon, on the carbon with Br. Remaining blemish: the SN2 bond-to-lone-pair arrow
starts at the C-Br bond midpoint, which is under the "Br" label, so its curve crosses the "r".
