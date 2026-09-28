# Validation Rules

Package section **#13 Validation Engine**. Contracts: `src/core/validation/contracts.ts`. Rule IDs below are stable; tests and findings reference them.

## 1. Levels and where they run

| Level | What | Runs | Blocks commit? |
|---|---|---|---|
| L1 Structural | Zod schema per record (types, enums, caps, strictness, ID formats) | main thread, per touched record; worker for imports/boot | ERROR blocks |
| L2 Referential | reference registry: existence, allowed kinds, layering, local/nested resolution, global ID uniqueness | main thread, touched records + reverse-index dependents | ERROR blocks |
| L3 Domain | chemistry-agnostic domain rules (outcome consistency, hierarchies, curriculum, relationships) | main thread incremental; full pass in compute worker | ERROR blocks |
| L4 Chemistry | structure parsing and heuristics via RDKit | chem worker, async, debounced | never blocks |

Commit pipeline: a command's recipe produces the next state → L1 on changed records → L2/L3 on changed records plus dependents found through the reverse index → any ERROR ⇒ the command is rejected and state is unchanged (INV-12). L4 findings arrive later and update the finding store; they never modify data (INV-24).

Rules are **lifecycle-aware**: some rules are WARNING for `draft` and ERROR for `published`. Drafts may be incomplete but are always structurally valid and referentially intact. Structurally invalid work lives only in editor sessions (UI_ARCHITECTURE.md §7).

## 2. Severities

- **ERROR** — the data is wrong or inconsistent; cannot be committed (L1–L3). In import previews, ERROR records are quarantined or must be resolved before confirmation.
- **WARNING** — probably wrong or incomplete; committed, visible in the inspector and diagnostics.
- **INFO** — suggestion or completeness hint.
- **REVIEW_REQUIRED** — a person must verify (imported ambiguities, parsed conditions, unverified syllabus). Never blocks; counted in the status bar; filterable everywhere.

## 3. Rule catalogue

### L1
| ID | Rule | Severity |
|---|---|---|
| SCHEMA | Record fails its Zod schema (unknown key, wrong type, cap exceeded, malformed ID, NaN/Infinity, control characters) | ERROR |

### L2 — references
| ID | Rule | Severity |
|---|---|---|
| REF-001 | Referenced record does not exist | ERROR |
| REF-002 | Referenced kind not allowed for this field (or `{kind,id}` prefix mismatch) | ERROR |
| REF-003 | Reference points to a higher layer | ERROR |
| REF-004 | Local reference (stage → participant, variant → stage, outcome → variant, route step → step) unresolved | ERROR |
| REF-005 | Nested reference unresolved (profile not in that reagent; outcome/variant not in that reaction; mechanism variant not in that mechanism; scheme placement not in that reaction) | ERROR |
| REF-006 | Duplicate ID (record or nested, dataset-wide) | ERROR |
| REF-007 | Forbidden self-reference (class is its own parent, reaction instance of itself) | ERROR |
| REF-008 | Rich-text `[[link]]` target missing | WARNING |

**Precedence (REF-002 vs REF-003).** A reference to a higher layer is always also outside the field's allowed kinds, so both rules would apply. Report **only REF-003** in that case, never both. The L2 validator (step 1.7) checks the layer first and emits exactly one diagnostic per bad reference: REF-003 when the target kind's layer is above the owner's, otherwise REF-002 when the kind is not allowed for the field. Fixture: `data/fixtures/schema/v1/invalid/l2-ref-003-higher-layer.json`.

### L3 — reactions
| ID | Rule | Severity |
|---|---|---|
| RXN-001 | No reactant participant | draft WARNING / published ERROR |
| RXN-002 | No outcome with at least one product | draft WARNING / published ERROR |
| RXN-003 | An outcome has zero products | draft WARNING / published ERROR |
| RXN-004 | Spectator with `contributesAtoms: true` | ERROR |
| RXN-005 | Catalyst flagged `consumed` (e.g. AlCl₃ in FC acylation: use role reagent + caveat) | WARNING |
| RXN-006 | More than one `isPrimarySubstrate` | WARNING |
| RXN-007 | Stages present but a participant is in no stage or in several | ERROR |
| RXN-008 | `exclusive` outcome overlaps another outcome for the same variant set | ERROR |
| RXN-009 | `minor` outcome without a `major` outcome for an overlapping variant set | WARNING |
| RXN-010 | More than one `major` outcome for the same variant set and isomer group | WARNING |
| RXN-011 | `profileId` on a participant whose ref is not a reagent | ERROR |
| RXN-012 | Some outcomes are variant-specific while others apply to all variants | INFO |
| RXN-013 | `instanceOfId` target is not generic, this reaction is not specific, or the target is itself an instance | ERROR |
| RXN-014 | Range with min > max, or temperature below absolute zero | ERROR |
| RXN-015 | Any `parsedFields` present (conditions filled by a parser, unconfirmed) | REVIEW_REQUIRED |
| RXN-016 | Published reaction without reaction type, transformation and mechanism class | INFO |
| RXN-017 | A product equals a reactant within one outcome | WARNING |
| RXN-018 | `equilibrium` without a `reverse_of` relationship or a note | INFO |
| RXN-019 | Intermediate with none of ref, label, structure | ERROR |
| RXN-020 | Condition variant referenced by no outcome (when ≥2 variants) | WARNING |
| RXN-021 | Same substance twice with the same role (use a coefficient) | WARNING |
| RXN-022 | Scope mismatch: generic reaction without class refs, or specific reaction with class refs | WARNING |
| RXN-023 | `workup_reagent` outside a workup/quench stage when stages exist | WARNING |
| RXN-024 | Coefficient on a catalyst or solvent | INFO |

### L3 — substances, classes, reagents, hierarchies
| ID | Rule | Severity |
|---|---|---|
| SPC-001 | Two species share a folded canonical name without distinguishing qualifiers | WARNING |
| SPC-002 | `speciesKind: ion` with zero or absent charge | WARNING |
| SPC-003 | `single_stereoisomer` without descriptors | WARNING |
| SPC-004 | Species with neither structure nor formula | INFO |
| SPC-005 | Species name equals a class name (possible hub-as-species confusion) | INFO |
| SPC-006 | `classIds` lists both a class and its ancestor | INFO |
| SPC-007 | Property key `other` without a label | ERROR |
| CLS-001 | Example species does not list the class (or a descendant) | WARNING |
| CLS-002 | Two classes share a folded canonical name | WARNING |
| RGT-001 | Reagent has both `speciesId` and `components` | WARNING |
| RGT-002 | Duplicate profile labels within one reagent | WARNING |
| HIER-001 | Cycle in class, concept or named-reaction parents, or in the topic tree | ERROR |
| HIER-002 | Topic parent has a lower-level topic kind than the child | WARNING |
| HIER-003 | Cycle in reagent composition | ERROR |

### L3 — mechanisms, relationships, routes, caveats
| ID | Rule | Severity |
|---|---|---|
| MEC-001 | Mechanism with no variants, or a variant with no steps | INFO |
| MEC-002 | Step species with none of ref, label, structure | ERROR |
| MEC-003 | Electron movements present but no step structure carries atom maps | WARNING |
| MEC-004 | More than one rate-determining step in a variant | WARNING |
| REL-001 | Endpoint kind not allowed for the relationship type | ERROR |
| REL-002 | `from` equals `to` | ERROR |
| REL-003 | Duplicate relationship (same type and endpoints; unordered for symmetric types) | WARNING |
| REL-004 | `reverseKind` missing on `reverse_of`, or present on another type | ERROR |
| REL-005 | Cycle in an acyclic relationship type (`prerequisite_of`) | ERROR |
| REL-006 | `reverse_of` microscopic while either reaction is marked irreversible | WARNING |
| RTE-001 | Route step graph has a cycle or references itself | ERROR |
| RTE-002 | A step's input does not match any product of the step it claims to use (exact or via class) | WARNING |
| RTE-003 | Route with no steps | draft WARNING / published ERROR |
| RTE-004 | Route target is not produced by a final step | WARNING |
| CAV-001 | Caveat with no targets | WARNING |
| CAV-002 | Target role inconsistent with target kind (affected_reagent → species) | WARNING |

### L3 — curriculum, presentation, assets, review
| ID | Rule | Severity |
|---|---|---|
| CUR-001 | Exam version `effectiveFrom` after `effectiveTo` | ERROR |
| CUR-002 | A topic appears twice in one exam version's coverage | WARNING |
| CUR-003 | `exam_relevance.examVersionIds` not belonging to `examId` | ERROR |
| CUR-004 | Conflicting exam relevance for the same target, exam and overlapping versions | WARNING |
| CUR-005 | Exam version `official` without a citation to a syllabus document | REVIEW_REQUIRED |
| CUR-006 | Duplicate topic mapping (same topic, same target) | WARNING |
| PRS-001 | More than one `entity_display` for a target (lowest ID wins) | WARNING |
| PRS-002 | Duplicate navigator anchors for a target | WARNING |
| PRS-003 | Duplicate participant placements in one reaction scheme | WARNING |
| AST-001 | Asset attached to nothing | INFO |
| AST-002 | Asset blob missing from storage | WARNING |
| AST-003 | Asset bytes do not match `sha256` (import) | ERROR (asset quarantined, not the whole import) |
| RVW-001 | `review.status = review_required` (reasons shown) | REVIEW_REQUIRED |
| RVW-002 | Published record references a draft record | INFO |

### L4 — chemistry (chem worker, never blocking)
| ID | Rule | Severity |
|---|---|---|
| CHEM-001 | Structure cannot be parsed | WARNING |
| CHEM-002 | Valence or sanitisation problem | WARNING |
| CHEM-003 | Entered formula differs from derived formula | WARNING |
| CHEM-004 | Entered charge differs from structure charge | WARNING |
| CHEM-005 | Atom imbalance (only when every participant and product is a species with structure and coefficient) | INFO |
| CHEM-006 | Stereo descriptors disagree with the structure | WARNING |
| CHEM-007 | Class SMARTS membership disagrees with stated `classIds` (both directions, as suggestions) | INFO |
| CHEM-008 | Mechanism bond change or electron movement uses an atom map absent from the step structures | WARNING |
| CHEM-009 | Two species have identical canonical structures | WARNING |

## 4. Engine design

- A rule is a `ValidationRule` object `{id, level, kinds, defaultSeverity, scope, description, check}` (plus optional `watches`, `peers` and `referencedReads`, §5) registered in a rule list. Adding a rule never edits another rule. Rules are pure functions of `(record, RuleContext)`; they read neighbours through indexes, never by scanning all records.
- `scope: record` rules re-run only for changed records; `neighbourhood` rules also for records whose references point at a changed record (reverse index) *and* something the rule reads of it changed (`referencedReads`, §5); `global` rules (cycles, duplicate names) are maintained through indexes and re-run for the affected component.
- Finding IDs are stable hashes of `(ruleId, subject id, path)`, so the UI can track "the same problem" across edits and dismissals are unnecessary (a fixed problem disappears; an unfixed one keeps its ID).
- The full pass (`validateAll`) runs in the compute worker at boot, after import and after migrations, and must finish in < 3 s at 5k reactions (PERFORMANCE_ARCHITECTURE.md §2). The main-thread incremental pass must fit the 16 ms commit budget.
- Messages are plain text written for a student-author ("Outcome 2 is marked minor, but no major outcome exists for 443 K."), with `path` pointing to the exact field so the inspector can focus it.
- Rules see only the record-local indexes (`CoreIndexes`: `get`, `referrersOf`, `definersOf`, `byFoldedName`, hierarchy ancestry); `ReadonlyIndexes` extends them, so anything richer is a Phase 2 addition. REF-006 uses `definersOf` (nested ID → defining records); REF-008 uses the `RICH_TEXT_PATHS` registry (`src/core/schema/rich-text.ts`), kept in step with the schemas by a test.
- **No auto-fix mutates data silently.** Suggested fixes are explicit commands offered as buttons ("Mark this participant as reagent") and are undoable like any edit.

## 5. Implementation notes (step 1.8)

- **Gating.** Per record, L1 → L2 → L3; a level runs only when the one below found no ERROR. WARNING-level L2 findings (REF-008) do not stop L3.
- **Ownership of edge cases.** A participant's `profileId` on a non-reagent is RXN-011 (L3). REF-005 covers profiles missing from an existing reagent.
- **Peers.** Incremental validation covers touched records, their referrers and referents, and the peers each rule names (`ValidationRule.peers`/`watches`): name twins (SPC-001, SPC-005, CLS-002), duplicate-ID definers (REF-006), rich-text linkers (REF-008), hierarchy members (HIER-001, SPC-006, CLS-001), reagent composition (HIER-003), relationship chains and neighbours (REL-003, REL-005), records sharing a target (CUR-004, CUR-006, PRS-001, PRS-002), and routes reached through reactions, species and classes (RTE-002, RTE-004). `validateTouched` takes the previous state so a record's old names, IDs and references are covered too. A test compares the store maintained this way with `validateAll` after every step of seeded random edit walks.
- **Field-aware referrer scope (step 2.12, ADR-031).** A referrer of a touched record is re-validated only if a rule of its kind reads something that changed. `referencedReads` declares, per kind of referenced record (or `'*'`), the top-level fields a rule reads of the records its subject refers to; `[]` is "only whether it exists" (REF-001), `{}` is "nothing" (every `scope: 'record'` rule, RXN-018, REL-003/005, CUR-004/006 and the other rules whose reads go through `peers` or the subject's referrers). A record created or deleted changes everything about it; a rule that declares nothing re-runs on any change (safe by default). The diff is by top-level field, by reference, against `previous`; without `previous` every referrer is kept. Only the referrer expansion is narrowed: referents (RXN-018 and AST-001 read their own referrers) and `peers`/`watches` are as before, and the touched records and their referents are re-validated whole. **Per-rule re-validation (step 2.13, ADR-032):** a referrer, or a peer named by an L3 rule, is re-run only for the rules that read what changed (or that named it) and merged into the finding store with `FindingStore.replaceForRules`, so its findings of every other rule survive; if an affected rule is L2 (REF-*) the record is re-validated whole, because an L2 ERROR gates its L3 rules off, and a per-rule subject that already has an L1/L2 ERROR is left alone (it has no L3 findings). `Validator.validateTouchedByRule` plans and runs this and `commitTouched` commits it; `scopeOf`/`validateTouched` still mean "whole subjects". Undeclared today: HIER-001, HIER-003, RTE-002, RTE-004 (they walk hierarchies, compositions or routes through derived indexes); SPC-006 is declared (`class: parentIds`, verified by the audit, which counts a hierarchy walk up from a referenced record as a read of that kind's parent field). `peers` is field-aware for rules that declare `peerReads` (the mirror of `referencedReads`: which fields of a touched record the rule reads of it when validating one of its other records): `peers` is called only when a listed field changed or the record was created/deleted. Declared: SPC-001, SPC-005, SPC-006, CLS-001, CLS-002, HIER-001; a rule that declares nothing has its `peers` called on every touch. So renaming a class, or editing its notes, re-runs nothing on the species that list it; moving it under another parent re-runs SPC-006 on them (and only SPC-006). A declaration must list every field the rule reads: `reads-audit.test.ts` traces the reads of every declared rule and checks them against it. Renaming, aliasing or annotating a species used by a thousand reactions now re-validates none of them; changing its `review`, or deleting it, still re-validates all (RVW-002 reads `review`, REF-001 reads existence).
- **Interpretations.** Overlap of variant sets treats an empty list as "all variants" (RXN-008/009/010). RXN-020 is silent when an outcome applies to all variants. Duplicate rules that name a winner keep the lowest ID clean (CUR-006, PRS-001, PRS-002). Name rules compare canonical names, silenced by differing qualifiers. Atom maps (MEC-003) are recognised in SMILES only; a molfile counts as possibly mapped. Graph walks in rules stop at 10,000 nodes and say so.
- **Other layers.** AST-002 and AST-003 need storage or bytes and are raised by persistence and import (phase 3) as ordinary findings; CHEM-001…009 by the chem worker (phase 4). `src/core/validation/rules/external.ts` lists them, and a test checks that every catalogue ID is implemented or owned.
