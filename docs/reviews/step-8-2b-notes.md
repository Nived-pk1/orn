Part A done, commit pending, next: Part B
Parts B, D done (code+unit), C core done, commit above; next: C UI, E, e2e
Part C UI + E written (unit green); next: e2e specs, update stale e2e, screenshots, docs, deploy
Part C/E/e2e specs written + chromium green for new spec; next: check, sizes, docs, full e2e, deploy
full e2e started Wed Nov  4 17:10:13 IST 2026
Fixed legend-shift regression (arrow key moved to line row); re-running failed specs in 3 engines
Part F docs done; NOT deployed/pushed (e2e product failures, check not green on final code); awaiting reviewer
fix Part A: bisect 91c9834..26456f1 all green alone (19/19), HEAD green alone x2; baseline full check running
fix Part S: mapInspectorView (pure) + test done (red 'Cannot find module ./map-inspector-view'); next: inspector store entries, bridge, views
fix Part S: store entries, bridge, MapPane (arrow/bucket), machine test green; next: fix other unit tests, then Parts B,C,D,E,F
fix Part B code (shareSlots + S4 label/tone) done; next: C box scale, D lazy, E, F
fix Part C code (boxScale layout/scene/text, fitRule) done; next D lazy, E, F
fix Part D done (383.99/387.97), E1 done; next E2,E4,E5 then check, e2e, docs, deploy
fix Parts E2,E4,E5 code done; running full check; next e2e specs
fix: e2e specs written/updated; running affected specs in chromium
fix: check green 706/8065; committed e2e; next: full chromium e2e, firefox/webkit affected, sizes recheck, docs, deploy
