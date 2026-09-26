# Search

Package section **#16 Search**. Contracts: `src/search/contracts.ts`, `src/core/text/contracts.ts`.

## 1. Architecture

MiniSearch runs in the **search worker**. The main thread builds `SearchDocument`s from records (pure function in `src/search`) and sends incremental updates derived from each ChangeSet (`upsert`, `remove`, `revision`). The serialized index is cached in `derivedCache` keyed by revision for warm boots; a mismatch triggers a background rebuild while the previous index keeps answering.

Indexed kinds: species, class, reagent, reaction, named reaction, concept, mechanism, transformation, caveat, route, topic, reference. Presentation records are not indexed.

## 2. Chemistry-aware normalisation

`TextNormalizer.fold` (in `src/core/text`, shared with duplicate-name validation):
1. Unicode NFKC; case folding; diacritics removed (Reimer–Tiemann = reimer tiemann).
2. Sub/superscript digits and signs → ASCII (C₂H₅OH → c2h5oh, Br⁻ → br-).
3. Greek letters → names (α → alpha, β → beta, ν → nu, Δ → delta).
4. All dash variants (‐ ‑ ‒ – — −) and whitespace runs → single space; apostrophes and primes removed (Baeyer's → baeyers). Exception: a dash directly after a letter or digit and not before one is a charge sign and is kept as `-` (Br⁻ → br-); this also keeps `fold` idempotent.
5. `tokens()` also emits joined variants so "wolff-kishner", "wolff kishner" and "wolffkishner" all match.

## 3. Fields and ranking

| Field | Boost | Notes |
|---|---|---|
| names (canonical, display, IUPAC, common, aliases, profile aliases) | 4 | prefix search on |
| formula (entered or derived) | 3 | exact token match; "C2H5OH" and "C₂H₅OH" fold equal |
| structure text | 2 | exact after trim; substructure search is ARCHITECTURALLY SUPPORTED (RDKit in chem worker) |
| tags | 2 | |
| text (summaries, notes, rule/statement for caveats; capped 4,000 chars/doc) | 1 | |

Fuzzy matching: edit distance 1 for terms ≥ 5 characters, 2 for terms ≥ 9; none for shorter terms (formulas and abbreviations must be exact). Ties: exam scope of the active exam version (official > prerequisite > enrichment > outside), then published over draft, then name. Facets: kind, reagent family, topic, scope, review status.

## 4. Command palette grammar (Ctrl/⌘ K)

- Plain text searches everything.
- Prefixes narrow the kind: `r:` reactions, `s:` species, `c:` classes, `g:` reagents, `n:` named reactions, `m:` mechanisms, `t:` topics, `>` commands (e.g. `> export`, `> new reaction`, `> toggle exam scope`).
- Results are virtualised; Enter opens in the inspector and focuses the node; Alt+Enter opens in the reaction explorer.

## 5. Budgets

p95 query < 50 ms at 5k reactions (worker time); input debounced 80–120 ms; stale responses are cancelled. Full index build < 1.5 s at 5k reactions in the worker.
