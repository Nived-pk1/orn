# JEE Ontology and Syllabus Versioning

Package sections **#9 JEE Ontology** and **#10 Syllabus Versioning**. Schema: `src/core/schema/curriculum.ts`.

> **Status: every coverage statement in this file is REVIEW REQUIRED.** The baseline below is a working structure for organising content, not a transcription of an official syllabus. An exam version may be marked `official` only after it has been checked against the published NTA (JEE Main) or organising-IIT (JEE Advanced) syllabus document and cites it (CUR-005).

## 1. Principles

1. Chemistry exists independently of any exam. No chemistry record references a topic, exam or year (INV-13, INV-29, INV-30).
2. The curriculum is a **lens**: topics organise records; exam versions say which topics count; scope is derived.
3. Syllabi change by year. Changes are new `exam_version` records, never edits to chemistry.
4. Unknown or unverified coverage is shown as such, never guessed.

## 2. Structure

- `topic` tree: `subject → chapter → section → topic → subtopic` (`topicKind`, `parentId`, fractional `order`). Version-independent; names follow common NCERT/JEE usage with aliases for alternative chapter names.
- `topic_mapping`: any L1–L2 record ↔ topic, many-to-many, with role `core`, `supporting` or `enrichment`. Diazonium → phenol maps to both *Amines* and *Alcohols, phenols and ethers*.
- `exam` (JEE Main, JEE Advanced), `exam_version` (label, year, status `official | provisional | draft`, effective dates, `units[]` each with `topicCoverage[]` = `{topicId, coverage: included | partial | excluded}`), `exam_relevance` (explicit per-record override).

### Baseline organic topic tree (seed; REVIEW REQUIRED)

| Chapter | Sections (examples) |
|---|---|
| Some basic principles and techniques (GOC) | nomenclature; isomerism; inductive, resonance, hyperconjugation, electromeric effects; reactive intermediates and their stability; types of reactions and reagents; purification; qualitative and quantitative analysis |
| Stereochemistry | chirality; R/S; E/Z; optical activity; conformations; stereochemical outcomes of SN1/SN2/E2/additions |
| Hydrocarbons | alkanes (free-radical halogenation, conformations); alkenes (electrophilic addition, Markovnikov, peroxide effect, ozonolysis, hydroboration); alkynes (acidity, partial reduction); aromatic hydrocarbons (aromaticity, EAS, directing effects, Friedel–Crafts) |
| Haloalkanes and haloarenes | preparation; SN1/SN2; elimination; Wurtz, Wurtz–Fittig, Fittig; Finkelstein, Swarts; haloarene reactivity |
| Alcohols, phenols and ethers | preparation; acidity; oxidation; dehydration; Lucas test; phenol reactions (Reimer–Tiemann, Kolbe); Williamson; cumene process |
| Aldehydes, ketones and carboxylic acids | nucleophilic addition; oxidation/reduction (Clemmensen, Wolff–Kishner, Rosenmund, Stephen, Etard, Gattermann–Koch); aldol; Cannizzaro; haloform; tests; acidity of acids; HVZ; derivatives |
| Amines and diazonium salts | basicity; preparation (Gabriel, Hofmann bromamide); carbylamine; diazotisation; Sandmeyer, Gattermann; coupling |
| Biomolecules | carbohydrates; proteins; nucleic acids; vitamins |
| Polymers (REVIEW: presence varies by exam and year) | addition/condensation; examples |
| Practical organic chemistry | detection of elements and functional groups; tests |

## 3. Syllabus versioning (#10)

- Adding a year: duplicate the previous `exam_version` (new ID, new units/coverage IDs) → edit coverage → cite the syllabus document → set `official` when verified. The Syllabus view offers a **derived diff** between two versions: topics added, removed, changed coverage, and the count of records whose derived scope changes.
- Superseded versions stay; `effectiveTo` closes them. The exam-scope selector (top bar) chooses the active version; default is the latest `official`, else the latest `provisional` with a visible "provisional" label.
- Records never change when a syllabus changes; only derived scope does.
- 2026-10-12 (5.8 review): the selector starts at "All (no exam scope)" on a first run and then keeps the user's choice. Which exam a student sits is theirs to choose; the app does not guess. This replaces the default above (latest `official`, else latest `provisional`) for the first run; the "provisional" label rule still applies to any version shown.

## 4. Derived exam scope

For record R and active version V of exam E, `scopeOf(R)` returns `official | prerequisite | enrichment | outside | unmapped`:

1. **Explicit override**: `exam_relevance` records for (R, E) whose `examVersionIds` contain V, else those with empty `examVersionIds`. The version-specific set wins. If several remain with different scopes, CUR-004 warns and precedence is `official > prerequisite > enrichment > outside`.
2. **Mapped coverage**: collect the topics R maps to, plus their ancestors. If any has coverage `included` or `partial` in V → `official` (`enrichment` if every such mapping has role `enrichment`); `partial` adds a "partial" marker. If mapped topics exist but none is covered and at least one is `excluded` or absent → `outside`.
3. **Prerequisite**: an unmapped or outside concept that is a prerequisite (`prerequisiteConceptIds`, `prerequisite_of`) of an `official` record, one hop only → `prerequisite`.
4. Otherwise `unmapped`.

Family scope rule (2026-10-12, 5.8 review; approved): a family (hub) is outside the active version when it has at least one reaction (leaving or arriving) and every one of them is `outside`. The family's own record is not used, and a family without reactions is never outside. Such a family is faded and marked in words, never hidden.

Scope filters in every view: *Official*, *Official + prerequisites*, *All* (outside-scope records dimmed, not hidden, with a scope badge). Filters never hide unanchored or unmapped content from the Diagnostics counts.

## 5. Named-reaction coverage checklist (candidate; REVIEW REQUIRED)

Used by content authors to find gaps; the Syllabus view derives "present / missing" from named-reaction records.

Aldol condensation · Cross aldol · Cannizzaro (incl. crossed) · Clemmensen reduction · Wolff–Kishner reduction · Rosenmund reduction · Stephen reduction · Etard reaction · Gattermann–Koch · Gattermann · Friedel–Crafts alkylation · Friedel–Crafts acylation · Reimer–Tiemann · Kolbe electrolysis · Kolbe (Kolbe–Schmitt) · Williamson ether synthesis · Wurtz · Wurtz–Fittig · Fittig · Finkelstein · Swarts · Sandmeyer · Diazotisation · Azo coupling · Gabriel phthalimide · Hofmann bromamide degradation · Carbylamine reaction · Hell–Volhard–Zelinsky · Haloform (iodoform) · Fischer esterification · Saponification · Cumene process · Ozonolysis · Hydroboration–oxidation · Kharasch (peroxide) effect · Lindlar reduction · Birch reduction · Beckmann rearrangement · Pinacol–pinacolone rearrangement · Claisen condensation · Perkin reaction · Benzoin condensation · Diels–Alder · Schotten–Baumann · Hunsdiecker · Arndt–Eistert · Michael addition · Wittig reaction · Tests: Tollens', Fehling's, Baeyer's, Lucas, Br₂-water, FeCl₃, 2,4-DNP.

Items beyond the common JEE Main list (e.g. Birch, Beckmann, Wittig, Arndt–Eistert, Michael) are typical JEE Advanced or enrichment material; their scope must come from verified exam versions, not from this list.

## 6. Authoring workflow

Content authors map every new reaction to at least one topic (a missing mapping is not an error — INV-13 — but the Syllabus view lists unmapped records). Exam relevance overrides are rare and must carry a note. Imported relevance flags (v6) arrive as `review_required` overrides (MIGRATION.md §4.5).
