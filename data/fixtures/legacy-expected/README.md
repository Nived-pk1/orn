# Expected outputs of the legacy dry run (step 3.11c)

For each legacy fixture (`data/fixtures/legacy/v6-demo-export.json`, `v4-sample.json`) and each live store (**empty**, and a store
holding `data/seed/demo.orn.json`) this folder holds what the real import pipeline (parse, port, ID space, mappers, conflict analysis,
merged replica, validation, preview) produces, with a **fixed clock** (`2026-09-21T14:13:20.000Z`, ms 1 790 000 000 000) and a **fixed ID
source** (seeded, so the batch ID is fixed):

- `<fixture>.<store>.preview.json` - the whole `ImportPreview` (counts, findings, decisions, the full legacy report, ...).
- `<fixture>.<store>.report.json` - the full `LegacyImportReport` alone.

Serialisation is deterministic: keys sorted (`canonicalJson`), two-space indent, a final newline.

## Who writes them

Only `scripts/legacy-expected.mjs`, run **by hand**: `node scripts/legacy-expected.mjs` (it runs `src/test-support/legacy-expected-cli.ts`
with `tsx`). **No test ever writes these files.** `tests/integration/legacy-import-expected.test.ts` builds the same outputs in memory
and fails on any difference (line endings are normalised before comparing).

## When they must change

A change to the demo dataset (`data/seed/demo.orn.json`), to the legacy fixtures, to any mapper in `src/io/legacy-v6`, to the import
pipeline or to the validation rules changes these files. Regenerating them is then a deliberate act: run the script, read the diff, and
record the **reason** in `docs/PROGRESS.md` (the step that made the change). A failing comparison is never "fixed" by regenerating
without looking at what changed.
