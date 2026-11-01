# Step 7.3c fact sheet (Part B; docs only, no product code)

Line numbers are those of commit a6a62e4 plus the Part A work of this step. Nothing here needed a schema change.

## B1. Reagent schema
- `ReagentSchema` `src/core/schema/substances.ts:170-186`: `names` (canonical, display, aliases), `speciesId?` (set when the reagent is exactly one
  species, :172), `components[]` (`{ ref: SubstanceRef, role, amountText? }`, :155-159, max 16; mixtures and supported/poisoned catalysts),
  `formulaText?`, `families[]`, `classIds[]` (classes with classKind `reagent_family`), `profiles[]` (max 16), `description?`, `studyNotes?`, `notes?`.
- Families, `REAGENT_FAMILIES` (:132-150), 17 values: oxidant, reductant, acid, base, lewis_acid, nucleophile, electrophile, radical_initiator,
  catalyst, dehydrating_agent, halogenating_agent, organometallic, diazotising_agent, coupling_agent, drying_agent, solvent, test_reagent. UI words today:
  the value with `_` replaced by a space (`view-substance.tsx` `words`, chapters `study-cards.tsx` `replaceAll('_', ' ')`).
- Component roles, `COMPONENT_ROLES` (:153): active, support, poison, solvent, additive, co_catalyst.
- Profile, `ReagentProfileSchema` (:162-168): `id` (`rpf_...`), `label`, `aliases[]`, `parameters: ConditionParameters`, `behaviour?` (rich text).
  Conditions type, `ConditionParametersSchema` `src/core/schema/conditions.ts:76-92`: temperature, pressure, time (each qualitative | value | range), medium,
  solventCharacter[], anhydrous, light, atmosphere, activation[], other[], text, parsedFields[].

## B2. Participant
- `ParticipantSchema` `src/core/schema/reaction.ts:68-84`. `role`: reactant, reagent, catalyst, solvent, initiator, promoter, additive, workup_reagent,
  spectator (:38-47). `profileId?` (:78): only when `ref.kind === 'reagent'` and a profile of THAT reagent (RXN-011). `phase?` s|l|g|aq|alc|soln|melt (:51),
  `strength?` dilute|concentrated|fuming|glacial|saturated (:52), `dry?`, `quantity?` `{ equivalents?, qualifier?, text? }` (:61-65; qualifier catalytic|excess|
  limiting|stoichiometric|trace), `originalText?` (kept verbatim, e.g. "alc. KOH"). Stage link: a stage lists `participantIds` (:94); with stages present each
  participant is in exactly one (RXN-007). Stage kinds reaction|workup|quench|activation|purification (:88).
- A reaction names a reagent by a DIRECT ref only: `participant.ref = { kind: 'reagent', id }`. The reagent's backing species (`speciesId`) and its `components`
  are NOT followed: a reaction that names the species KMnO4 directly is a use of the species, not of the reagent. The index below is built on the direct
  ref only (`derived.ts:55-56`). So a participant CAN name a profile (no STOP).

## B3. Inspector for a reagent
- `ReagentLevels` `src/features/inspector/view-substance.tsx:152-195`: L2 Identity (formula, families as words, species link, classes, description);
  L3 "Composition and profiles": one line per component (`Component (<role>)`, link, `, amountText`) and per profile `Profile: <label>` = the phrases of the
  parameters joined by `; `, then ` (also: <aliases>)` and the behaviour note; L4 notes, citations, `Connections`.
- Profile conditions are worded by `parameterPhrases` `src/features/inspector/model/conditions.ts:17-32`: "temperature cold", "temperature 80 C", "basic medium",
  "solvent aqueous", "anhydrous", "light ...", "atmosphere ...", "activation ...", the `other` entries, then "as written: <text>". Stored words, nothing converted.
  The reagent feature cannot import the inspector: the app injects a words port.

## B4. Indexes
- "Which reactions use reagent X": `reactionsByReagent(id)` (`full.ts:150`, table `byReagent`, `derived.ts:25,55-56`): reaction ids, deduplicated per reaction,
  sorted. `reactionsByReagentFamily(family)` joins at query time. Used per profile by reading the reaction's participants (no profile index exists; a profile
  section reads the reactions of the reagent, a handful per reagent, bounded by the reagent's count).
- "Which reagents contain X": no index. Walk the `reagent` table and test `components[].ref` (the table is small: 16 in the demo; the walk is one pass over the
  reagents, bounded by the table size, done once per snapshot and cached in the view model). `participationsOf(ref)` lists a SUBSTANCE's participations by id.
- Cost on the demo: `byReagent` is a table lookup (constant); the components walk is 16 reagents x at most 16 components.

## B5. The Reactions filter
- `ExplorerFilter` `src/ui/state/explorer-state.ts:26-36`: `substanceIds`, `usedAs` any|reactant|arrow|product, plus families, types, named reactions, review
  statuses, text, onlyInScope. A reagent id in `substanceIds` is accepted (the substance picker offers species, classes and reagents; `usedAs` "arrow" is the
  reagent-side use). The port that opens Reactions filtered: `openReactions(ui, setMode, filter)` `src/app/window/reactions-entry.ts:19`, with
  `filterFor(ref)` giving `{ substanceIds: [ref.id], usedAs: 'any' }` for species, class and reagent. The Reagents view receives `showInReactions(reagentId)` from the app.

## B6. Modes, explorer kind, switch, uiState
- `MODES` `src/app/window/modes.ts:30`: `{ id: 'reagents', label: 'Reagents', unavailable: 'Phase 7' }` (to become live). `ExplorerKind = 'reactions' | 'precursors'`
  (`explorer-state.ts:15-16`, tolerant parse :104-108 falls back to `reactions` and names `explorer.last`). The Explore switch `explore-switch.tsx:11-14` has two
  choices. `uiState` keys (`navigator-persist.ts:43`): selected, expanded, collapsedEdgeIds, viewports, openFamily, overviewMode, phoneTab, recentSearches,
  activeExam, explorer, precursors, chapters. A sibling key `reagents` is added the way `chapters` was (tolerant parse, `damaged` names).

## B7. Search
- `src/search/document/parts.ts:41`: a reagent's aliases AND its profiles' labels and aliases are searched (boost 4, reported as `alias`); `builder.ts:11` also
  indexes formula text, profile behaviours, description, notes. Demo: "Baeyer's reagent" is the label of `rpf_baeyers` on KMnO4, "Cold dilute alkaline KMnO4"
  its alias, "alc. KOH" / "aq. KOH" aliases on KOH. So "Baeyer's reagent" finds Potassium permanganate through the search. The Reagents list filter "Find by name"
  uses the same fields in core (folded), without the search worker.

## B8. Demo
- 16 reagents. With profiles: Acidified potassium dichromate (`rpf_dichromate-distil`, `rpf_dichromate-reflux`), Potassium hydroxide (`rpf_koh-aqueous` "Aqueous
  KOH", alias "aq. KOH"; `rpf_koh-alcoholic` "Alcoholic KOH", alias "alc. KOH"), Potassium permanganate (`rpf_baeyers` "Baeyer's reagent"; `rpf_permanganate-hot`
  "Hot, concentrated", NO reaction uses it: the "no reaction uses this profile yet" case).
- Reactions naming a profile: dichromate-reflux 2, dichromate-distil 1, baeyers 1, koh-alcoholic 1, koh-aqueous 1 (27 reactions in all, 18 reagent/profile pairs).
- KMnO4 reagent backs species `spc_potassium-permanganate`; KOH backs `spc_potassium-hydroxide`.

## STOP conditions checked
- Showing a profile's reactions or conditions needs a schema change: NO (participant `profileId`, profile `parameters`).
- A participant cannot name a profile: NO (it can, :78).
- The card host cannot draw a reaction by id: NO (`ReactionCardHost` takes `reactionId`, used by the Chapters view).
