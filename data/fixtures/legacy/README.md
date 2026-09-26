# Legacy fixtures

Generated in Phase 0 from the legacy v6 HTML app (`Organic_Reaction_Navigator_v6.html`) by running its own
data-layer code (script lines 1–294: `defaultData`, `migrateLegacy`, `splitLegacyReagent`, `normalizeData`)
in a Node `vm` context with DOM stubs. Nothing here was hand-edited except `v4-sample.json`.

| File | What it is | Used by |
|---|---|---|
| `v6-demo-export.json` | Byte-for-byte what v6's "Export JSON" produces for its built-in demo (21 compounds, 22 reactions, schemaVersion 5) | v5 → ORN mapper tests, Gate C/F audit |
| `v4-sample.json` | Hand-made v4 prototype data covering every v4 field and edge case (duplicate names, dangling IDs, staged reagents, temperatures in reagent strings, unknown fields) | v4 → v5 port tests |
| `v4-sample.normalized-by-v6.json` | Oracle: v6's own `normalizeData` applied to `v4-sample.json` | The TypeScript port must deep-equal this |

These files are frozen. If the legacy behaviour must be re-derived, regenerate them with the same method and record it in docs/PROGRESS.md.
See docs/MIGRATION.md §4.
