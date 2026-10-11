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
| names (canonical, display, IUPAC, common) and aliases (aliases, reagent profile labels and aliases) | 4 each | prefix search on (the only fields it applies to) |
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

## 6. As built (step 4.5, 2026-10-01)

- **Documents** (`src/search/document`, pure). One per record of the §1 kinds; relationships, exams, exam versions, topic mappings, exam relevance, assets and presentation records have none. Every document is built from its own record only, so it never holds the name or text of another record. What it reads from elsewhere is derived data that is not indexed as text: `scopeRanks` (core's `scopeOf` per exam version, 0 official to 3 outside; a record the version does not map has no rank), `facets.scopes`, `facets.topicIds` (topics mapped to the record and their ancestors) and, for a reaction, `facets.reagentFamilies` (families of its reagent participants). The entered formula, and (step 5.1b) for a species the formula the chem worker derived from its structure: `derivedFormula`, built from the port `derivedFormulaOf` (the L4 service's memory), indexed with `formula` as one field (boost 3, exact; configuration id 2) and reported as a `formula` hit with the text that matched. A new or changed derived formula reaches the index through `SearchSync.refresh(ids)`. The exact contents per kind are in the header of `src/search/document/builder.ts`.
- **Query.** The text is cut into words; each word into folded parts (`C₂H₅OH` is `c2h5oh`, `Wolff-Kishner` is `wolff` + `kishner`). Every part is looked up in names and aliases (prefix and fuzzy), in formulas (exact) and in tags and text (fuzzy, no prefix); the whole word is also looked up as a structure (exact, case kept). A word with several parts is its joined form (names only, prefix, no fuzzy) or all its parts. All words must be found; the joined form of all the words is an alternative to the whole. At most 16 words and 1,000 characters; the palette parser cuts to them and says so.
- **Order.** Score (rounded to 9 decimals), then the scope rank of the query's exam version, then published before draft, then the folded title, then the id: a total order, the same for an index built by updates and one built at once. Facets and kinds filter; an empty facet list is no constraint; with an exam version the scope facet is read under it (`unmapped` matches a record without a rank). No words with a filter lists what the filter admits; no words and no filter lists nothing.
- **Updates.** `SearchIndexUpdate.fromRevision` must be the index's revision, else `apply` answers `REVISION_MISMATCH` with `have` (-1: nothing loaded) and the main-side sync does one full load. The sync (`src/workers/search/sync.ts`, `fanout.ts`) rebuilds the changed records and the documents whose derived data another record's change moved (a topic mapping or exam relevance: its old and new target; a reagent's families: its reactions; a prerequisite, relationship or any mapping: every concept; an exam version's units or the topic tree: everything), queued 250 at a time with the rest behind them, and sends only documents that differ from the last one sent.
- **Serialisation.** `serialize()` / `loadSerialized({ json, revision })`: one JSON text (MiniSearch's export plus the documents, the format version and the configuration id). A text that does not load is `BAD_INDEX` as a value. **Warm boot (step 5.1b, `src/app/services/search-part.ts`).** The writer tab serialises the index after it has been up to date for 5 s and stores ONE row in `derivedCache` (key `search_index`, kind `search_index`, value `{ revision, json }`); at boot a row of the store's revision is loaded with `loadSerialized` and adopted (`SearchSync.adopt`), so no document is built; any other row, `BAD_INDEX`, a worker failure or a store that moved on while it loaded is ONE full load; a refused cache write is a status.

- **Known limitation (step 4.5 review, 2026-10-01).** Fuzzy matching at edit distance 1 counts a swap of two adjacent letters as two edits, so "Reactoin" does not find "Reaction". A Damerau distance is not in MiniSearch; accepted.

## 7. The palette as built (step 5.8, 2026-10-11)

- **UI** (`src/features/search`): cmdk 1.1.1's `Command` inside our native `Dialog` (CSP spike: zero violations in Chromium, Firefox and WebKit; cmdk filters nothing, the search worker ranks). Ctrl/Cmd K and the top bar's Search open it with the input focused. The text goes through `parsePalette` (§4); a newer input supersedes the older (a token per input; the answer of an older one is dropped even when it succeeded, and the service cancels the call on the `palette` channel); the query is sent 100 ms after the last key, asks for 100 hits with the active exam version.
- **Rows.** Hits are grouped by kind (groups in the order of their best hit, the engine's order inside a group), flattened to header and hit rows of fixed heights and windowed (a hundred hits render about twenty rows); because cmdk only knows the rows in the DOM the arrows, Page keys and Enter are handled over the whole list. Each hit says what matched in words: the name, an alias (with the alias), the formula, the DERIVED formula (the matched formula equals the one the chem worker derived and not the entered one), the structure text, a tag, the notes.
- **Not ready.** `NOT_READY` is "Search is starting" (asked again every 500 ms, at most 20 times, then "Search did not start"); never an empty list as an answer. Another failure says its code; an empty answer says "No results for ...".
- **Enter** opens the record in the inspector and places it: a family is selected on the map, a reaction opens its family page at its card, any other record shows in the inspector with its places. The typed text becomes a recent search (at most 8, saved in `uiState`).
- **Commands** (`> text`): a registry that `src/app` fills with what exists (replace with the demo dataset, undo import, fit, zoom in, zoom out, Map / List, Overview, open the Unanchored reactions, choose the exam scope); a command that cannot run now is listed with its reason and says it when chosen.
