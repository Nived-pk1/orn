# Domain Model

Package sections covered here: **#4 Canonical Domain Model**, **#5 Complete Data Schema** (with `src/core/schema/`), **#7 Reaction Outcome Model**, **#8 Mechanism Model**, and part of **#12 Compound/Structure Authoring**.

The executable source of truth is `src/core/schema/*.ts` (Zod). This document explains *why* the schema looks the way it does and how to model real chemistry with it. If this document and the schema disagree, the schema wins and this document must be corrected in the same commit.

---

## 1. Record kinds and layers

Canonical data is a set of **records**. Each record has a `kind`, an immutable `id`, and belongs to exactly one layer. A record may reference only records in the **same or a lower layer** (INV-05). Because chemistry never points upward, deleting or rewriting the curriculum or the presentation layer can never invalidate chemistry.

| Layer | Kind | Prefix | Purpose |
|---|---|---|---|
| 1 Foundation | `reference` | `ref` | Evidence source (NCERT, textbook, paper, syllabus document) |
| 1 | `concept` | `cpt` | Teachable idea: reaction type, mechanism class, effect, rule |
| 2 Chemistry | `species` | `spc` | A specific substance (ethanol, NO₂⁺, a carbocation drawn as a species) |
| 2 | `class` | `cls` | A generic family (alcohols, 1° alcohols, R–MgX, hydride reductants) |
| 2 | `reagent` | `rgt` | What a chemist adds; may be a mixture; has usage profiles |
| 2 | `transformation` | `trf` | Class-level interconversion ("1° alcohol → aldehyde") |
| 2 | `named_reaction` | `nrx` | Identity of a named reaction (Aldol, Cannizzaro …) |
| 2 | `mechanism` | `mec` | Reusable mechanism with variants and steps |
| 2 | `reaction` | `rxn` | A reaction, first-class record (never an edge) |
| 2 | `caveat` | `cav` | Exception, trap, limitation, special case |
| 2 | `route` | `rte` | Stored multi-step synthesis |
| 2 | `relationship` | `rel` | Curated relation between records (alternative, reverse, confused-with …) |
| 3 Curriculum | `exam`, `exam_version` | `exm`, `exv` | Exam and a dated version of its syllabus |
| 3 | `topic` | `top` | Version-independent subject tree (chapter → section → topic) |
| 3 | `topic_mapping` | `tmp` | Places any L1–L2 record into a topic (many-to-many) |
| 3 | `exam_relevance` | `erl` | Explicit override of derived exam scope |
| 4 Attachments | `asset` | `ast` | Image metadata; bytes stored separately |
| 5 Presentation | `navigator_anchor` | `anc` | Makes a record a navigator hub |
| 5 | `reaction_scheme` | `rsc` | How a reaction is drawn (above/below arrow) |
| 5 | `view_preset` | `vpr` | Saved named view configuration |
| 5 | `entity_display` | `edp` | Per-record display preference (e.g. water: never a node) |

Transient UI state (selection, viewport, open panels, expansion) is **not** canonical and is stored in the `uiState` store (PERSISTENCE.md §2), never in records (INV-10).

## 2. Identifiers

- Format `<prefix>_<body>`; body matches `[0-9a-z][0-9a-z-]{1,62}`. Runtime IDs use a lowercase ULID body (`rxn_01j9z…`). Seed data and fixtures may use readable bodies (`rxn_ethanol-pcc`). Legacy imports use deterministic bodies (`spc_v6-c15`, MIGRATION.md §4.2).
- IDs are opaque. They are never derived from names, never parsed for meaning (except the prefix → kind check), and never change (INV-03). Renaming a record changes `names`, not `id`, so every reference survives a rename.
- **Nested objects have IDs too** (participant `prt`, stage `stg`, condition variant `cvr`, outcome `out`, product `pdt`, intermediate `int`, reagent profile `rpf`, mechanism variant `mvr`, mechanism step `mst`, route step `rst`, syllabus unit `unt`). Nested IDs are globally unique (INV-01) so routes, schemes, findings and mechanism links can address "the minor outcome of reaction X" precisely, and array reordering never breaks a reference.
- IDs are created only through `CommandContext.newId(prefix)` (injected) so the core stays deterministic under test.
- Operational IDs (`fnd` findings, `eds` editor sessions, `imp` import batches, `snp` snapshots) never appear as references inside canonical records.

## 3. Shared value types

**Text.** `NameText` (≤300, single line, non-blank), `LabelText` (≤200, single line), `ShortText` (≤2,000, multi-line), `RichText` (≤50,000, mini-markup). All reject C0 control characters and bidi override/isolate characters (spoofing). Schemas **validate but never transform**: no trimming, defaults or coercion, so parsing never silently changes data (INV-24).

**Names.** `canonical` (display default), optional `display`, `iupac`, `qualifier` (disambiguates same-named records, e.g. "(generic)"), and `common[]`, `aliases[]`. Unicode names are first-class (α-D-glucose, C₂H₅OH, Friedel–Crafts).

**Provenance.** `origin` (user | seed | import | legacy_import | generated), timestamps, optional `importBatchId`, optional `legacy { system, legacyId, unmapped }`. `legacy.unmapped` holds every legacy field without a mapped home (INV-23).

**Review.** Human curation state, separate from computed findings:
- `lifecycle`: `draft` (may be incomplete, e.g. a reaction with no product yet) or `published` (complete; stricter rules, VALIDATION_RULES.md §2).
- `status`: `unreviewed`, `review_required` (a person must check; `reasons[]` says why), `verified`.
- optional `confidence`, `reviewedAt`.

**Classification.** `{ conceptId, certainty: definite | probable | possible }`, used for explicit reaction types and mechanism classes. Automatic suggestions are shown in the UI but never stored.

**StructureRep.** `{ format: smiles | cxsmiles | molfile, value }` exactly as entered. Canonical SMILES, formula, charge, stereo facts and depictions are derived by the chem worker and cached (INV-11). Line notations are capped at 20,000 characters, molfiles at 1 MB.

**Citation.** `{ referenceId, locator?, note? }` on every non-presentation record and on species property entries.

### 3.4 Rich-text mini-markup

Rich text is a plain string with a deliberately tiny grammar, parsed by `core/text` into an AST (`RichNode`) and rendered as React elements. It is never interpreted as HTML or Markdown (SECURITY.md §2).

| Markup | Meaning |
|---|---|
| `*text*` | emphasis |
| `**text**` | strong |
| `_{text}` / `^{text}` | subscript / superscript (H_{2}SO_{4}, Br^{−}) |
| line starting `- ` | bullet item |
| blank line | paragraph break |
| `[[rxn_…]]` or `[[rxn_…\|label]]` | soft link to a record (REF-008 warns if missing; never blocks deletes) |

Parsing is total: malformed markup renders literally; it never throws.

## 4. References

Every reference field is declared once in the **reference registry** (`src/core/schema/references.ts`): owner kind, path, allowed target, and delete policy. All reference handling (validation, reverse index, delete impact, import remapping, subset-export closure, duplication) is generic over this registry; no code handles a reference field by name.

Target types: `id` (branded ID string), `ref` (`{kind,id}` with allowed kinds), `local` (nested ID in the same record), `nested` (nested ID inside another record, located via a sibling or root field).

Delete policies:
- **restrict** — delete blocked while the reference exists (participants, products, route steps, transformation classes, reagent components). The user re-points (`record.replaceReferences`) or deletes the referrer first. This is what makes "delete a compound used by 30 reactions" safe.
- **cascade** — the owner is meaningless without the target and is deleted with it (relationships, topic mappings, exam relevance, anchors, schemes, entity display).
- **detach** — the reference is removed from the surviving owner (tags-like links: concepts, citations, class memberships, optional mechanism links).

Every destructive command first runs a **delete-impact dry run** (`CanonicalStore.deleteImpact`) listing blocked, cascaded and detached items; the UI shows it before confirmation. Merging duplicates is `replaceReferences(from → to)` followed by deleting `from`, as one undoable batch.

## 5. Substances

### 5.1 Species
A specific substance. `structure` is optional because many species are taught before a structure is entered; a species without structure is valid (SPC-004 is INFO). `formula` is the user-entered formula; the derived formula is computed and a mismatch is a warning (CHEM-003), never an automatic overwrite. `stereo` records the claimed stereochemistry (kind + descriptors such as `2R`, `E`); `aromaticity` is a user claim shown beside the derived value. `properties[]` are keyed entries (boiling point, solubility …) with their own citations. `classIds[]` state explicit class membership; SMARTS-based membership is only ever a suggestion (CHEM-007).

### 5.2 Classes
A generic family: compound classes, functional groups, homologous series, reagent families. `parentIds[]` forms a DAG (1° alcohols ⊂ alcohols). `generic` holds the class-level representation (`R–OH`, `CnH2n+1OH`, a CXSMILES with R labels, a membership SMARTS). **A class is never represented by a single example compound.** The v6 hubs stored representative SMILES (Alcohols = `CCO`, Arenes = anthracene); the importer moves these to the legacy trace and flags review (MIGRATION.md §4.4). Curated examples go in `exampleSpeciesIds[]`.

### 5.3 Reagents
Identity of what is added, separate from how it is used:
- `speciesId` when the reagent is one defined species (PCC), or `components[]` for mixtures and supported catalysts (Lindlar = Pd on CaCO₃ [support] + quinoline [poison]). Composition is acyclic (HIER-003).
- `families[]` (oxidant, lewis_acid, …) power the reagent explorer; `classIds[]` link chemical reagent families (hydride donors).
- `profiles[]` are named usage conditions with aliases: KMnO₄ → profile "cold, dilute, alkaline" alias "Baeyer's reagent".

**Same reagent, different outcome.** Aqueous KOH (substitution) and alcoholic KOH (elimination) are the *same reagent record* (KOH) used by *different reactions* with different participant `phase` (`aq` / `alc`) and different outcomes. Encoding "alc. KOH" as a separate reagent is a modelling error the reagent explorer would expose as a duplicate.

### 5.4 Choosing species, class or reagent

| Situation | Model as |
|---|---|
| A concrete compound (ethanol, benzene diazonium chloride) | species |
| "An aldehyde", "R–X", "any 1° alcohol" | class |
| Something added to effect the change (PCC, LiAlH₄, H₂/Lindlar) | reagent (optionally backed by a species) |
| A reactive intermediate drawn in a mechanism | inline structure in the mechanism step, or a species with `speciesKind: reactive_intermediate` if reused |
| A navigator hub | a class **plus** a `navigator_anchor` (presentation) |

## 6. Reactions

A reaction is a first-class record with nested, individually addressable parts. Reactions are never stored as graph edges; graph edges are projections (GRAPH_SEMANTICS.md).

### 6.1 Anatomy

```
Reaction
├─ participants[]      what goes in (reactants, reagents, catalysts, solvents, …)
├─ stages[]            ordered steps of ONE reaction (reagent addition, work-up, quench)
├─ conditionVariants[] alternative conditions that change the outcome
├─ outcomes[]          what comes out, under which variants, with what selectivity
├─ intermediates[]     notable intermediates (optionally per stage)
└─ links               namedReactionIds, transformationIds, reactionTypes, mechanismClasses,
                       mechanismIds, conceptIds, prerequisiteConceptIds, instanceOfId
```

### 6.2 Participant roles and flag defaults

| Role | contributesAtoms | consumed | catalytic | Default scheme position |
|---|---|---|---|---|
| reactant | yes | yes | no | reactant side |
| reagent | yes | yes | no | above arrow |
| catalyst | no | no | yes | above arrow |
| solvent | no | no | no | below arrow |
| initiator | no | yes | no | above arrow |
| promoter | no | no | no | above arrow |
| additive | no | no | no | below arrow |
| workup_reagent | yes | yes | no | above arrow, in its stage |
| spectator | **never** | no | no | hidden |

`flags` override defaults only when chemistry demands it; a spectator with `contributesAtoms: true` is an ERROR (RXN-004). A catalyst marked `consumed` is a WARNING (RXN-005) — this is exactly the Friedel–Crafts acylation trap (AlCl₃ is complexed by the product ketone and needed in stoichiometric amounts); model it as role `reagent` with a caveat. `isPrimarySubstrate` marks the carried-through substrate for navigation; `originalText` preserves the wording ("alc. KOH").

### 6.3 Conditions

`ConditionParameters` has structured fields — temperature (value, range or qualitative; °C or K), pressure, time, medium, solvent character, anhydrous, light, atmosphere, activation — plus `other[]` qualifiers, free `text`, and `parsedFields[]`. A stage carries its parameters; a condition variant overrides fields of one stage. Fields filled by a text parser (legacy import, quick-entry) are listed in `parsedFields` until a person confirms them, which raises REVIEW_REQUIRED (RXN-015). Diazotisation is `temperature: {kind:'range', min:0, max:5, unit:'C'}`, not the string "0–5 °C".

### 6.4 Outcome model (#7)

**Major/minor is a property of an outcome under stated conditions, never of a species** (INV-08). An outcome is `{ conditionVariantIds, selectivity, products[], isomerGroup, regiochemistry, stereochemistry, mechanism link, rationale }`.

- `conditionVariantIds` empty means "under all variants". Otherwise the outcome holds only under the listed variants.
- `selectivity`: `exclusive` (the only outcome for those conditions), `major`, `minor`, `trace`, `mixture_component` (comparable amounts), `unspecified`.
- `products[].role`: `main`, `coproduct` (formed in the same event, e.g. acetone in the cumene process), `byproduct` (H₂O, N₂, HX).
- `isomerGroup` groups competing outcomes ("HBr addition regioisomers"); `regiochemistry` names it (Markovnikov, para); `stereochemistry` records retention, inversion, racemisation, syn/anti addition …
- Contradictions are validated: an `exclusive` outcome overlapping another outcome is an ERROR (RXN-008); a `minor` without a `major` for the same conditions is a WARNING (RXN-009).

| JEE case | Model |
|---|---|
| Propene + HBr | one reaction; outcomes: 2-bromopropane `major` (Markovnikov), 1-bromopropane `minor`, same isomerGroup |
| Propene + HBr, peroxide | a *separate* reaction (different reagent system), outcome anti-Markovnikov `major`; `contrasts_with` relationship + `exception` caveat targeting the first reaction |
| EtOH + conc. H₂SO₄ | one reaction; variants "413 K" and "443 K"; outcomes diethyl ether (variant 413 K) and ethene (variant 443 K) |
| (R)-2-bromobutane + aq. KOH vs alc. KOH | two reactions (same reagent KOH, different phase); SN2 outcome with `stereochemistry.outcome: inversion`; E2 outcome with Saytzeff `regiochemistry`; `competing_with` relationship |
| Cannizzaro | reactant coefficient 2; outcome products alcohol + carboxylate, both `main`; `commonly_confused_with` Aldol |
| Unknown/unstated selectivity | `unspecified` — never guess |

### 6.5 Generic and specific reactions
`scope: generic` reactions are written with classes (R–CH₂OH → R–CHO); `specific` reactions use concrete species. A specific reaction may declare `instanceOfId` → a generic reaction (RXN-013: target must be generic, no chains). Navigation can show "12 specific examples of this generic reaction" from the reverse index.

### 6.6 Reversibility
`reversibility.kind`: `equilibrium`, `reversible_under_other_conditions`, `irreversible`, `unknown`. The reverse *reaction* is its own record linked by a `reverse_of` relationship with `reverseKind`: `microscopic` (esterification ⇌ acid hydrolysis), `synthetic` (hydration vs dehydration under different conditions), `conceptual` (taught as opposites). Graphs never infer reversibility from a precursor view (GRAPH_SEMANTICS.md §5).

### 6.7 Stages versus routes
Stages are the ordered steps of *one* reaction as usually written (1. CH₃MgBr, dry ether → 2. H₃O⁺ work-up). With stages present every participant belongs to exactly one stage (RXN-007). A sequence whose intermediate is isolated and is itself a substance of interest is a **route** of separate reactions. Rule of thumb: if the intermediate deserves its own node, use a route.

### 6.8 Links to knowledge
`namedReactionIds`, `transformationIds`, `reactionTypes` (concepts of kind `reaction_type`), `mechanismClasses` (kind `mechanism_class`), `mechanismIds`, `conceptIds`, `prerequisiteConceptIds`. Examples of a named reaction, all reactions of a transformation, and "reactions using PCC" are derived from indexes, never stored twice.

## 7. Mechanism model (#8)

```
Mechanism (reusable, referenced by reactions and outcomes)
└─ variants[]            e.g. acid-catalysed vs base-catalysed aldol; SN1 vs SN2 pathway
   ├─ applicability      when this pathway operates
   ├─ rateLaw
   └─ steps[]            ordered
      ├─ stepKinds[]     proton_transfer, nucleophilic_attack, hydride_shift, …
      ├─ species[]       role + (ref | label | inline structure with atom maps)
      ├─ bondsFormed[] / bondsBroken[]   atom-map pairs, bond order
      ├─ electronMovements[]            curved arrows: from site → to site, 1 or 2 electrons
      └─ isRateDetermining, reversible, stereochemicalEvent, description
```

- Reactions point to mechanisms (`mechanismIds`); an outcome may point to a specific mechanism variant (`outcome.mechanism.variantId`), so the SN2 outcome and the E2 outcome of a substrate link to different pathways.
- Atom-map numbers in step structures make bond changes and curved arrows machine-checkable (CHEM-008) and are the foundation for future arrow-pushing animation (ARCHITECTURALLY SUPPORTED, not required now).
- A mechanism may have only a `summary` and no steps (legacy imports, early drafts); MEC-001 reports that as INFO.

## 8. Knowledge records

- **Transformation** — class-level interconversion with `fromClassIds`/`toClassIds`, `equationText`, optional `reactionSmarts` (future matching), `carbonChainChange` (ascent/descent for conversion problems).
- **Named reaction** — identity, aliases (Reimer–Tiemann / Reimer Tiemann), family hierarchy (Friedel–Crafts → acylation), summary and teaching notes. Its reactions, mechanisms and transformations are derived.
- **Concept** — 15 kinds (reaction type, mechanism class, electronic effect, reactive intermediate, stability, acidity/basicity, stereochemistry, rule …) in a DAG (SN2 ⊂ nucleophilic substitution).
- **Caveat** — exceptions and traps as records: `rule` (the generalisation), `statement` (the exception), `trigger`/`triggerConditions`, `explanation`, `targets[]` with roles (affected reaction, substrate, reagent …). One caveat can qualify many records; a reaction shows all caveats targeting it or its reagents/substrates.
- **Route** — stored multi-step synthesis; steps reference reactions (optionally outcome and variant) and form a DAG via `inputFromStepIds` (RTE-001). Search results are transient until saved.
- **Reference** — evidence source cited by any record.

## 9. Curriculum

Topics are a version-independent tree; exam versions declare topic coverage per unit; `topic_mapping` places records into topics (many-to-many, so diazonium → phenol can sit in two chapters); exam scope of a record is **derived** from mappings and coverage, with `exam_relevance` as an explicit override. Details, derivation rules and the baseline JEE tree are in JEE_ONTOLOGY.md.

## 10. Presentation

Hubs (`navigator_anchor`), reaction drawing choices (`reaction_scheme`), saved views (`view_preset`) and per-record display (`entity_display`: water shown on arrows, never as a node) are layer-5 records. They reference chemistry; chemistry never references them; deleting all of them leaves chemistry valid and unchanged (INV-14). Since schema version 2 (step 5.5c, ADR-037) a `navigator_anchor` may carry the curated arrangement of the overview: `cell` (`column`, `row`: integers 0-63), `group` (a short label, e.g. "Oxygen compounds") and `tone` (`blue`, `green`, `amber`, `violet`, `teal`, `rose`, `slate`). All three are optional; an overview where every hub has a cell is drawn on a grid, otherwise by the layered layout. Two hubs on one cell, or one group in two tones, are WARNINGs (PRS-004, PRS-005).

## 11. Assets

Asset records hold metadata (media type, size ≤ 20 MB, SHA-256, dimensions, alt text, role, `attachedTo[]`); bytes live in the `assetBlobs` store. An image may accompany chemistry but is never its only representation (INV-17). SVG assets are displayed only through `<img>` with blob URLs (SECURITY.md §2).

## 12. Compound and structure authoring (#12, data side)

- Entry order: name first, structure optional. A structure can be typed (SMILES/CXSMILES), pasted (molfile), or drawn in a structure editor (ARCHITECTURALLY SUPPORTED: Ketcher adapter behind a `StructureEditor` interface in `src/features/workbench`).
- As the user types, the chem worker parses (debounced) and returns derived facts and a depiction; the editor shows them beside the entered values. Nothing derived is written unless the user explicitly accepts it as a separate edit.
- Duplicate detection on save: folded-name matches (SPC-001) and identical canonical structure (CHEM-009) are shown with a "use existing / merge / keep both" choice.
- A species without structure is valid; a species with an unparsable structure is saved with a CHEM-001 warning, because the text may be a legitimate notation the toolkit does not support.
