# Step 8.5d notes (ONE size rule for drawings, formulas and names; was 8.5c C3)

Resume point: CLOSED 2026-11-24 (deployed, pushed); see PROGRESS "Step 8.5d".

## START
HEAD 5fecb4d clean, stash empty, in sync with origin. Sizes (fresh builds): Study 338,438 / Studio 342,436. Speed check 1.47 s (over 1.2): the load is other Claude Code sessions and the owner's Edge windows; not stopped.
Two stale `vite preview` processes of THIS repo (PIDs 18620 on 4173, 20968 on 4174, started 09:59 today, left by an earlier session) blocked Playwright's ports; stopped by PID.

## Label measure (real RDKit 2026.03, fixed scale = 54 units per bond, glyph box height)
Capital letters 15.4 to 16.0 px high at a 54 px bond (CO, ethyl ethanoate, C, Br-, adipic acid); the em is about 22 px. The prompt's two limits conflict: labels
"about 13 px" at the standard and "never below 11 px" at the 70 % floor need 15.7 px at the standard. The floor wins: ONE standard of 56 px for every context
(label 16.1 px, 11.3 px at the floor), not 46. Equation 54 is NOT kept: 54 * 0.7 gives 10.9 to 11.2 px.

## RED (spec tests/e2e/size-rule.spec.ts, desktop 1280 x 800 Chromium, START code, the awkward set from tests/e2e/awkward-set.ts)
Unit: size-rule.test.ts red (module absent); hero-fit.test.ts "one row scaled down ... floor" red (stacked instead of row 0.75).
E2E (17 s): 20 failures in the full equation (C20 chain bond 11.83, dimethyl hexanedioate 24.96, glucose 29.63, cholesterol 18.19, long-name 26.28; all atoms: 9.17, 18.86, 26.83, 13.25, 20.28; all outside 39.2..56 and labels under 11 px) and
every Structure box of the family page "a drawing has no data-bond-px" (38 lines: the fit-to-area drawing has no bond length).
