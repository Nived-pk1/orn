# Step 7.4 fact sheet (Part B; docs only, no product code)

Line numbers are those of HEAD a473727 plus the Part A work of this step. Nothing here needs a schema change. No STOP condition holds (see the end).

## B1. Named reactions
- `NamedReactionSchema` `src/core/schema/knowledge.ts:64-80`: `name`, `aliases[]`, `parentIds[]` (max 16, DAG, HIER-001), `summary?`, `typicalConditions?`,
  `conceptIds[]`, `prerequisiteConceptIds[]`, `difficulty?`, `studyNotes?`, `notes?`. It stores identity and teaching notes only; reactions are NOT listed on it.
- A reaction points to its named reactions with `Reaction.namedReactionIds[]` (`src/core/schema/reaction.ts:221`, max 16).
- Index "reactions of named reaction X": `reactionsByNamedReaction(id, { includeDescendants })` (`src/core/indexes/contracts.ts:104`, `full.ts:157-161`; table
  `byNamedReaction`, `derived.ts:28,68`). With `includeDescendants: true` it adds the reactions of every descendant (the family below it).
- Hierarchy: `ancestorsOf('named_reaction', id)` / `descendantsOf('named_reaction', id)` (`contracts.ts:72-75`) are TRANSITIVE. The direct children are the descendants
  whose own `parentIds` include `id` (the inspector does exactly this, `view-knowledge.tsx:45-58`). Parents are `record.parentIds`.

## B2. Mechanisms
- `MechanismSchema` `src/core/schema/mechanism.ts:106-118`: `name`, `aliases[]`, `mechanismClasses[]` (`{ conceptId, certainty }`, max 16), `summary?`, `variants[]`,
  `conceptIds[]`, `studyNotes?`, `notes?`. Variant `:97-104`: `id`, `label`, `applicability?`, `steps[]`, `rateLaw?`, `note?`. Step `:80-94`: `id`, `title?`, `stepKinds[]`
  (STEP_KINDS :14-33, 18 values), `description?`, `species[]` (`{ role, ref?, label?, structure? }` :73-78; roles STEP_SPECIES_ROLES :35-43: reactant, reagent,
  intermediate, transition_state, product, leaving_group, catalyst), `bondsFormed`, `bondsBroken`, `electronMovements` (the arrows; NOT drawn in this step),
  `isRateDetermining?`, `reversible?`, `stereochemicalEvent?`, `note?`.
- Pointers: `Reaction.mechanismIds[]` (`reaction.ts:232`) and `Outcome.mechanism?: { mechanismId, variantId? }` (`reaction.ts:148-151,166`).
- Index "reactions that use mechanism X": `reactionsByMechanism(id)` (`contracts.ts:107`, `full.ts:170`); the table `byMechanism` is filled from BOTH pointers (`derived.ts:76-79`).
- A named reaction reaches its mechanisms THROUGH ITS REACTIONS (no direct field): the union of `mechanismIds` and the outcomes' `mechanism.mechanismId` of the reactions
  of the named reaction (itself and, on its page, the descendants). Derived, not stored.

## B3. Caveats
- `CaveatSchema` `knowledge.ts:128-147`: `targets[] = { ref, as }`. Index `caveatsFor(ref)` (`contracts.ts:112`, `full.ts:189`, table `caveats` `derived.ts:41,96`) is by target id, so it
  answers for a named reaction, a mechanism AND a reaction alike. Demo: caveats target `nrx_cannizzaro`, `nrx_haloform`, and reactions.
- On a named-reaction page: the caveats of the named reaction itself plus those of its reactions (deduplicated, sorted by title, id). On a mechanism page: of the mechanism plus its reactions.

## B4. Pictures
- `PICTURE_KINDS` `src/core/editing/picture-kinds.ts:8`: species, class, reagent, reaction, transformation, **named_reaction**, concept, caveat, **mechanism**, route. Both carry pictures
  (assets whose `attachedTo` names the record; `picturesOf(state, ref)` :28). Demo: no asset is attached to anything (no pictures to show; the code path is tested with own data).
- The viewer the inspector uses: `RecordPictures` `src/features/inspector/view-pictures.tsx:90-103`. Outside the inspector it is reached as `InspectorPictures`
  (`src/features/inspector/standalone.tsx:41`, the 7.3b port pattern; the app hands the inspector's ports in).

## B5. Drawing a step's species
- The inspector draws a step species' inline `StructureRep` with `Depiction compact` (`src/features/inspector/depiction.tsx:16-32`, STEP_STRUCTURE 120x80,
  `view-mechanism.tsx:44`). It is internal to the inspector and not exported. Decision: a thin standalone wrapper `InspectorStructure` is added in `standalone.tsx` (the same
  7.3b pattern as `InspectorPictures`), so the Mechanisms page draws the structures the way the inspector does. The feature gets it as a port (`renderStructure`). Demo: all 3
  mechanisms have structures in their steps (14 / 10 / 4); a step species with no structure shows its label or the name of its record.

## B6. What the inspector shows today
- Named reaction `NamedReactionLevels` `view-knowledge.tsx:62-100`: L2 also called, family parents, children, difficulty, summary; L3 typical conditions, concepts, prerequisite
  concepts, reactions (direct and below); L4 study notes, notes, citations, connections.
- Mechanism `MechanismLevels` `view-mechanism.tsx:136-210`: L2 also called, classes with certainty, summary, variant list; L3 per variant steps (species with structures, bonds,
  electron movements, rate-determining, reversible), reactions per variant; L4 notes, connections.
- The pages repeat the study-relevant parts in a page layout; the inspector stays as it is.

## B7. Exam scope rule (Reagents)
- `reagent-list.tsx` (7.3c): `createScopeOf(indexes, examId, examVersionId)`; "Only <version>" is checked per reagent: kept when at least one of its reactions is NOT
  `'outside'` (`core/reagents/list.ts:76`: `reactions.some((id) => outside(id) !== true)`); a reagent with no reactions is hidden under the filter. On a page the cards are
  marked "outside <exam>" or hidden by the same checkbox (`reagent-page.tsx`, `profile-section.tsx`). Parts C-E copy this: a record is kept when it has at least one reaction
  that is not outside the scope; a record with none is hidden under the filter.

## B8. ExplorerFilter
- `ExplorerFilter` `src/ui/state/explorer-state.ts:21-31` has `namedReactionIds`; `filterFor` `app/window/reactions-entry.ts:11-15` already maps a named reaction to it. So "Show these
  reactions in Reactions" works for named reactions. There is NO mechanism field; no button for mechanisms (not asked for). No schema change in either case.

## B9. Modes, switch, uiState, palette, badge
- `MODES` `src/app/window/modes.ts:42-52`: `{ id: 'named', label: 'Named', unavailable: 'Phase 7' }` and `{ id: 'mechanisms', ... }` become live (`NAMED_MODE`, `MECHANISMS_MODE`).
- `ExplorerKind` `explorer-state.ts:13` is `'reactions' | 'precursors' | 'reagents'`; the switch `explore-switch.tsx:11-15` has three buttons. `window.tsx:162` maps the kind to a mode.
- `uiState` keys `navigator-persist.ts:44`: ... `chapters`, `reagents`. New sibling keys: `named`, `mechanisms` (tolerant parse, `damaged`).
- Palette: `palette-commands.ts:137` ("Open Reagents"); Alt+Enter: `features/search/palette.tsx:102,108` (reagent hit opens its page; a named-reaction hit shows its reactions today).
- The named-reaction badge on a card: `family-card.tsx:134-138`, a plain `<span className={styles.chip}>`. It does NOTHING when clicked today (no other behaviour to report); it
  becomes a button that opens the named reaction's page (an optional `openNamed` in the family env, set by the app).

## B10. Demo
- 13 named reactions, 3 mechanisms, 27 reactions. Named reactions with direct reactions: all except Friedel-Crafts (parent of Friedel-Crafts acylation; 0 direct, 1 below). Summaries: all
  except Baeyer's test, Friedel-Crafts, Friedel-Crafts acylation, Kharasch effect. No typical conditions, study notes, notes, prerequisites anywhere. Hierarchy: one pair only.
  Empty by the rule (no text, no reactions counting the family below it): none. Most reactions: Grignard 2, Haloform 2.
- Mechanisms: Aldol addition of ethanal (2 variants, 3 + 4 steps), E2 elimination of a haloalkane (2 variants, 1 + 1, rate laws), SN2 substitution of a haloalkane (1 variant, 1 step, rate
  law). Each has a summary, 1 class, 1 concept, 1 reaction; no study notes, no aliases. 2 mechanisms have 2 variants (screenshot `mechanism-variants`). Most steps: Aldol (7).

## B11. Temperature words and units (A4)
- `QUALITATIVE_TEMPERATURES` `src/core/schema/conditions.ts:10-18`: low_temperature, cold, room_temperature, warm, heat, reflux, strong_heat (stored; `_` becomes a space).
- `TEMPERATURE_UNITS` `conditions.ts:9`: `C`, `K` only. Celsius is written "°C"; Kelvin stays "K". Pressure and time are not changed.
- Solvent characters (`:48-56`): aqueous, alcoholic, ethereal, polar_protic, polar_aprotic, non_polar, neat. Written "<value> solvent".

## STOP conditions checked
- Showing any of this needs a schema change: NO.
- A reaction cannot be tied to its named reaction or mechanism from the data: NO (`namedReactionIds`, `mechanismIds`, `Outcome.mechanism`).
- The card host cannot draw a reaction by id: NO (`ReactionCardHost` takes `reactionId`).
