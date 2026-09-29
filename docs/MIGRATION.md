# Migration

Package section **#27 Migration from v6**, plus schema-version migrations (#10 uses the same machinery for curriculum data). Contracts: `src/core/migrations/contracts.ts`, `src/io/contracts.ts` (`LegacyImportReport`). Fixtures: `data/fixtures/legacy/`.

## 1. Schema versioning

- `CURRENT_SCHEMA_VERSION` (integer) lives in `src/core/schema/dataset.ts`. It is stored in `meta.schemaVersion` and in every export.
- **Bump rule:** any change that a strict older reader would reject bumps the version — new fields, new record kinds, and enum widening included. Pure documentation changes do not.
- Every version keeps a frozen fixture set in `data/fixtures/schema/v<N>/` (at minimum `minimal-valid.orn.json` and a maximal fixture that uses every field). Fixtures of old versions are never edited.
- An app that finds a newer version on disk or in a file opens read-only / refuses the import with an explanation; it never guesses.

## 2. Migration framework

- One pure, deterministic `SchemaMigration` per step (`from → from + 1`) in `src/core/migrations/steps/`. The runner applies steps in order on the **tolerant envelope** (records as unknown), then the result is parsed with the current strict schemas. `run` returns a value, never throws for document problems: `{ ok: true, doc, steps }` or `{ ok: false, code, message, atVersion }` with code `INVALID_VERSION`, `NEWER_VERSION`, `MISSING_STEP`, `STEP_FAILED` or `STEP_CONTRACT`; it verifies each step's output version and report, and returns no partial result.
- Runs in the compute worker. Stored data: `pre_migration` snapshot → migrate → full L1–L3 → `replaceAll` in one transaction. Any failure restores the snapshot and opens read-only (PERSISTENCE.md §12).
- Every step returns a `MigrationStepReport` (changed record IDs, notes) that is stored with the import batch or shown after an on-disk migration.
- Tests per step: the frozen `v<N>` fixtures migrate to documents equal to the committed expected `v<N+1>` outputs; the chain from v1 to current is tested; migrated data round-trips (P-03); undo history is empty after migration (history never spans versions).

## 3. Rules for writing a migration

1. Never drop information. Values without a new home go to `provenance.legacy.unmapped` of the affected record and into the report (INV-23).
2. Never infer chemistry silently. A value that must be interpreted gets `review.status = review_required` with a reason.
3. Deterministic: same input → same output, including generated IDs (derive from existing IDs + a stable hash).
4. Migrations never read the clock except through the injected context, and use the document's `exportedAt` as the timestamp for created records.
5. Migrations are data-only: they cannot depend on UI code or on the current app's non-schema modules.

## 4. Importing the legacy v6 app

### 4.1 Inputs

| Source | Shape | Detection |
|---|---|---|
| v6 "Export JSON" (`organic-reaction-navigator-v6.json`) | `{ compounds[], reactions[], schemaVersion: 5 }` | `schemaVersion === 5` and arrays present |
| v6 localStorage (`orn-v5`), pasted as text | same as above | same |
| v4 prototype data (`orn-prototype-v4`) | reactions with `start`, `end`, `coProducts`, `extra`, `reagent`, `family`, `condition`, `pattern`, `mech`, `collapse` and no `participants` array | any reaction without a `participants` array |

The new app runs on a different origin from the v6 HTML file, so it cannot read v6's localStorage; the user exports from v6 (or copies the stored JSON) and imports the file. The importer's first screen explains this in one sentence.

Fixtures (generated from the legacy code itself, see `data/fixtures/legacy/README.md`):
- `v6-demo-export.json` — exactly what v6 exports for its built-in demo (21 compounds, 22 reactions).
- `v4-sample.json` — hand-made v4 data exercising every legacy field and edge case.
- `v4-sample.normalized-by-v6.json` — the **oracle**: v6's own `normalizeData` applied to the v4 sample.

### 4.2 Deterministic IDs

Legacy IDs are sanitised to `[0-9a-z-]` (lowercase, other characters → `-`); if sanitising changed the value, `-<6-char hash>` of the original is appended. Then:

| Created record | ID |
|---|---|
| species / class from compound `c15` | `spc_v6-c15` / `cls_v6-c15` |
| reaction `r5` | `rxn_v6-r5`; nested `prt_v6-r5-<n>`, `stg_v6-r5-<n>`, `out_v6-r5-1`, `pdt_v6-r5-<n>` |
| record created from a free-text label | `rgt_v6-l-<slug>-<hash6>` / `spc_v6-l-<slug>-<hash6>` (deduplicated by folded label) |
| concept, named reaction, topic from text | `cpt_v6-<slug>-<hash6>`, `nrx_v6-…`, `top_v6-…` (reuse existing records matched by folded name/alias first) |
| trap → caveat | `cav_v6-r16-<n>` |
| relevance | `erl_v6-r16-main`, `erl_v6-r16-advanced` |
| related reactions | `rel_v6-<lower id>-<higher id>` (symmetric, one per pair) |
| image | `ast_v6-<first 16 hex of sha256>` |
| hub anchor / display | `anc_v6-c6`, `edp_v6-c14` |

Re-importing the same file therefore produces identical IDs, and the conflict analysis resolves them as `identical_skip`.

**Records without an `id`** (v6 would draw a random one) are never refused. The port (step 3.8) assigns the deterministic placeholders `c-missing-<n>` (compound) / `r-missing-<n>` (reaction), `n` = the first free number counting from the record's position, and lists them in `assignedIds`. From then on they are ordinary legacy IDs: they map through the table above like any other (`spc_v6-c-missing-3`, `rxn_v6-r-missing-1`; they need no hash suffix because they are already `[0-9a-z-]`). Every such record is a REVIEW REQUIRED item (§4.7).

### 4.3 Pipeline

1. **v4 → v5 normalisation**: a TypeScript port of v6's `migrateLegacy`, `splitLegacyReagent` and `normalizeData`, including their quirks. Its output must deep-equal the oracle fixture. Porting the legacy behaviour first means v4 data is interpreted exactly as the user saw it in v6. Implemented in `src/io/legacy-v6` (step 3.8) as `normalizeLegacyData(raw)`: it deep-equals the oracles for `v4-sample.json` and `v6-demo-export.json` and for a quirk workbook (`tests/fixtures/legacy-v6/`), all produced by v6's own code (`scripts/legacy-oracle.mjs`). Three things v6 does not do, all reported and never silent: (a) it returns `dropped`, the leaves of the input the v5 output does not hold verbatim (path → value; empty for both fixtures; e.g. v6 overwrites a non-boolean `collapse`, ignores a `mech` next to a `mechanism.summary`, deletes v4 keys from a v5 reaction and rebuilds participants from six known fields), which step 3.11's completeness test carries into `provenance.legacy.unmapped`; (b) a record without an `id` gets a deterministic placeholder (`c-missing-<n>` / `r-missing-<n>`, listed in `assignedIds`) instead of v6's `Math.random`; (c) input v6 would throw on or build garbage from (a document or record that is not an object, a compound without a text name that a reagent name has to be matched against) is refused as a value (`NOT_AN_OBJECT`, `INVALID_RECORD`, `INVALID_COMPOUND_NAME`) with the path. Quirks kept: migrated v4 participants carry no `image` (so v6 is not idempotent on its own v4 output: a second pass adds `image: ""`), role names that are inherited object keys count as roles, an unrecognised `nodeType` becomes `auto`, `Object.assign` copies of `conditions`/`transformation`/`mechanism`/`jee` keep unknown fields while participants do not.
2. **v5 → ORN mapping** (§4.4–§4.6) producing a `DatasetDocument` plus a `LegacyImportReport`.
3. The normal import pipeline (PERSISTENCE.md §6): quarantine, conflicts, merged-replica validation, **preview with decisions**, snapshot, one atomic apply.

### 4.4 Compound mapping

| v6 field | ORN |
|---|---|
| `nodeType: 'major'` (hub) | **class** (`classKind: compound_class`) + `navigator_anchor` (order = legacy order). Preview decision per hub: "class (default) / species". |
| hub `smiles` (representative: Alcohols `CCO`, Arenes = anthracene) | **not** used as class structure. Kept in `legacy.unmapped.smiles`; class marked `review_required` ("representative SMILES not used; add an example species if intended") |
| hub `genericFormula` | `class.generic.formulaText` |
| other compounds (`auto`, `branched`, `sub`) | **species** (`speciesKind: 'unspecified'`) |
| `name` | `names.canonical` (duplicates by folded name → SPC-001 warning + review) |
| `smiles` (non-hub) | `structure {format: 'smiles'}` (L4 flags unparsable → CHEM-001) |
| `formula` | `formula` |
| `fgId`, `functionalGroups[]` | class membership: the hub class with the same `fgId` if one exists, else a `functional_group` class created from the legacy FG registry label (review) |
| `compoundClass` (text) | class matched by folded name, else created (review) |
| `properties` (free text) | species `notes` (class `description` for hubs) |
| `acidBase` | `acidBaseNotes` |
| `aromaticity` | enum when it is exactly aromatic / non-aromatic / antiaromatic, else `legacy.unmapped` + review |
| `stereo` (text) | `stereo {kind: 'unspecified', descriptors: [], note}` + review |
| `jee.level`, `jee.notes` | `studyNotes` (level kept in `legacy.unmapped`) |
| `node: false` | `entity_display { showAsNode: 'never' }` |
| `nodeType: branched / sub` | `legacy.unmapped.nodeType` (v6 view hint; ORN derives this) |
| `tags` | `tags` (tags over 64 characters → `legacy.unmapped`) |
| `image` (data URL) | `asset` (`legacy_image`) attached to the record; undecodable → report + review |

### 4.5 Reaction mapping

| v6 | ORN |
|---|---|
| participant `substrate` | `reactant` + `isPrimarySubstrate: true` |
| `reactant` / `reagent` / `catalyst` / `solvent` / `spectator` | same role |
| `workup` | `workup_reagent` in a second stage of kind `workup` (stage 1 holds all other participants) |
| `product` / `byproduct` | products of **one outcome**: `major: true` → role `main`; other products → `coproduct` + review ("coproduct or minor isomer?"); byproducts → `byproduct`. Selectivity `unspecified` (v6's `major` meant "main arrow target", and v6 auto-assigns it when none was marked) |
| `intermediate` | `intermediates[]` (`intermediateKind: other`) + review |
| participant with `ref` | reference to the mapped species/class; a missing compound ID creates a placeholder species "Missing legacy compound <id>" (draft, review) so nothing dangles and nothing is lost |
| participant with only `label` | label parser (§4.6) → matched or newly created reagent (for reagent-like roles) or species (for substance roles), review |
| participant `note`, `image` | `note`; asset attached to the reaction with the label as note |
| `conditions.text` | stage 1 `parameters.text` and `originalText` |
| `conditions.temperature/medium/phase/strength/pressure/atmosphere` | parsed into structured fields when unambiguous, else `other[]`; all listed in `parsedFields` (RXN-015 review) |
| flags `heat`, `light`, `anhydrous` (regex-inferred by v6) | `temperature: qualitative heat` (if no temperature), `light: hv`, `anhydrous: true`; all in `parsedFields` |
| `transformation.from/to` | `generalizedEquation` "from → to" |
| `transformation.fgFrom/fgTo` | `transformation` record matched by class sets or created (review); `bondChanges` → its `bondChangeSummary` |
| `mechanism.type` | concept (`mechanism_class`) matched/created → `mechanismClasses` (certainty `probable`) |
| `mechanism.summary` | `mechanism` record with the summary, no variants (MEC-001 info) |
| `reactionType` | concept (`reaction_type`) → `reactionTypes` |
| `reactionFamily` | concept (`reaction_family`) → `conceptIds` |
| `reagentFamily` (free text such as "aq. KOH", "Cumene process") | `legacy.unmapped`; the preview lists distinct values for optional mapping to reagent families |
| `namedReaction` | named reaction matched by folded name/alias or created → `namedReactionIds` |
| `chapter` | topic matched by folded name/alias in the curriculum tree, else created as a chapter (review) → `topic_mapping (core)`; "Uncategorised" → no mapping |
| `jee.relevance` both / main / advanced | `exam_relevance` for JEE Main and/or JEE Advanced, scope `official`, all versions, **review** ("imported flag, not verified against a syllabus") |
| `jee.difficulty` 1–5 / 0 | `difficulty` / absent |
| `jee.traps[]` | one `caveat` (`trap`) per entry targeting the reaction |
| `jee.prerequisites[]`, `jee.concepts[]` | concepts matched/created → `prerequisiteConceptIds`, `conceptIds` |
| `relatedReactions` | `related_to` relationships (one per unordered pair) |
| `collapseIntermediates`, `_v4` audit trail | `legacy.unmapped` |
| `image` | asset attached to the reaction |
| `scope` | `specific` if every substance ref is a species, `generic` if any is a class; mixed → `generic` + review (RXN-022) |
| lifecycle | `published` if RXN-001/002 pass, else `draft`; status `unreviewed` unless a review trigger fired |

### 4.6 Label parser

Tokens are removed from a participant label into structured fields; `originalText` always keeps the untouched label.

| Token | Field |
|---|---|
| `aq.`, `(aq)`, `(aq.)`, `aqueous` | `phase: 'aq'` |
| `alc.`, `alcoholic` | `phase: 'alc'` |
| `conc.`, `concentrated` / `dil.`, `dilute` / `fuming` / `glacial` / `sat.` | `strength` |
| `dry`, `anhydrous` | `dry: true` |
| `(excess)`, `excess` | `quantity.qualifier: 'excess'` |
| `(cat.)`, `catalytic` | `quantity.qualifier: 'catalytic'` |
| a whole label that is a temperature (`443 K`, `140°C`, `0-5 °C`) | not a participant: moved to the stage's `temperature`, added to `parsedFields` |
| `hv`, `hν`, `light`, `UV` as a whole label | moved to `light` in stage parameters |

The remainder is matched against existing reagents/species by folded name or alias (so "aq. KOH" and "alc. KOH" both resolve to the single reagent **KOH** with different phases). Unmatched remainders create one shared record per folded label, `review_required`.

### 4.7 REVIEW REQUIRED triggers (never silent)

Hub representative SMILES; hub treated as species by decision; created-from-label records; missing compound placeholders; non-major products; intermediates; parsed conditions; created concepts/topics/named reactions/transformations; imported exam relevance; mixed-scope reactions; duplicate folded names; unrecognised aromaticity or stereo text; undecodable images; any unsafe key renamed; a record that had no id in the legacy file (placeholder `c-missing-<n>` / `r-missing-<n>`, §4.2).

### 4.8 No-loss guarantee

A leaf that the v4 → v5 port reports as `dropped` (step 3.8) follows a fixed rule: a dropped leaf whose value is empty (`""`, `[]`, `{}`, `null`) and was replaced by a default counts as **consumed by default** and is counted per path in the report (`consumedByDefault`, path → occurrences); any dropped leaf with content is stored in the record's `provenance.legacy.unmapped` and raises a review item. (`dropped` itself stays strict: it lists both kinds and the split happens in step 3.11.)

A completeness test walks every leaf of the legacy JSON and asserts it is either consumed by a mapping (the mapper records a trace of consumed paths) or present in some record's `provenance.legacy.unmapped` (INV-23). The report lists created counts, every review item with its reason, preserved unmapped fields with occurrence counts, and `notImported` (expected empty; each entry explains why).

### 4.9 Known quirks in real v6 data (from the fixtures)

- Hubs carry example structures: Alkanes `CCCC`, Alkenes `C=CC`, Arenes anthracene, Alcohols `CCO`, Ketones acetone.
- `r12` lists Alcohols as both substrate and reactant → two reactant participants referencing one class (RXN-021 warning, review) — kept, not merged.
- `r14` ester hydrolysis produces the specific species palmitic acid from the generic class Esters → mixed scope, review.
- `r18` cumene process links its acetone coproduct to the Ketones hub → coproduct points at a class, review suggests a specific species.
- v4 reagent strings like `conc. H2SO4, 443 K` made v6 store "443 K" as a *reagent* label; the label parser moves it to temperature.
- `r22` is an unanchored test reaction with chapter "Uncategorised" and no relevance → imported without topic or exam mapping, visible in the Unanchored list.
- v6 condition flags were inferred by regex; all of them become `parsedFields`.

### 4.10 Acceptance

Gate C: dry-run import of both fixtures with zero `notImported`, a complete report, and the preview matching the committed expected outputs. Gate F: full v6 end-to-end audit — import, review queue walk-through, export, re-import identical, and a side-by-side check that every v6 reaction and compound is findable in the new app.
