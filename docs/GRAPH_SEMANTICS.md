# Graph Semantics

Package sections: **#6 Graph Semantics** and the semantic half of **#17 Graph Layout** (the geometric half is in UI_ARCHITECTURE.md §6 and PERFORMANCE_ARCHITECTURE.md §5). Contracts: `src/core/graph/contracts.ts`, `src/core/indexes/contracts.ts`.

**Rule zero:** graphs are derived projections of canonical records. No graph, edge, layout, index or derived relation is ever stored as canonical data (INV-11). Two different projections of the same data may look completely different; neither is "the" graph.

## 1. The canonical graph

Canonical data forms a **bipartite, directed hypergraph**:

- **Substance nodes**: species, classes, reagents.
- **Reaction nodes**: one per reaction record.
- **Consumes** edges: substance → reaction, one per participant (carries `participantId`, role, phase, strength).
- **Produces** edges: reaction → substance, one per *outcome product* (carries `outcomeId`, `productId`, selectivity, product role, condition variants).

A reaction with 2 reactants and 3 outcomes (with 4 products in total) yields 2 + 4 edges. Multi-reactant, multi-product, multi-outcome reactions are represented without loss; that is why reactions are records, not edges.

Other derived edge families: class membership (species → class, class → parent class), relationships (stored, curated), `instance_of` (specific → generic reaction), `uses_reagent`, `prerequisite`.

## 2. Projection pipeline

```
ProjectionRequest {view, focus[], expansion, filters, limits}
  → seed nodes (focus records, or navigator anchors)
  → bounded traversal over indexes (depth / nodes / edges / time budget, AbortSignal)
  → scope & filter pass (exam version scope, topics, reagent families, review status)
  → roll-up (class hubs), virtual nodes (Unclassified, "+N more")
  → edge bundling (parallel edges grouped, never merged)
  → Projection {nodes sorted, edges sorted, bundles, unanchoredReactionIds, truncation}
```

Projections are pure functions of `(canonical state, indexes, request)`. They are memoised by a key made of the request hash and the revisions of the records they touched, so an edit to an unrelated reaction does not invalidate the current view. Filters are applied at projection time; they never mutate data.

## 3. Navigator hub view (the v6 experience, done right)

- **Hubs** are records with a `navigator_anchor` (presentation). Normally classes (Alcohols, Aldehydes …); a species or concept may be anchored too. Being a hub never changes chemical identity.
- A reaction appears as a **labelled arrow** from the hub of its primary substrate to the hub of each main product. The hub of a substance is: the anchored record itself; else the nearest anchored ancestor class of the substance (via `classIds` → class `parentIds`), chosen deterministically (shortest path, then lowest ID); else the virtual **Unclassified** hub.
- Hub attachment through membership is **inferred** and drawn dotted (§4). Attachment through an anchored record referenced directly is **stated**.
- Participants that are not the carried substrate (reagents, catalysts, co-reactants, solvents) appear as arrow labels following `reaction_scheme` placements or role defaults (DOMAIN_MODEL.md §6.2). A species with `entity_display.showAsNode = never` (water) is never a node.
- Arrows go to the hub of each **main** product (coproducts and byproducts are not drawn). The carried substrate is the participant flagged `isPrimarySubstrate`, else the first reactant; spectators and never-a-node species never qualify. A `showAsNode = never` record is not a hub even when anchored (step 2.3).
- Reactions that cannot reach any hub are listed in the **Unanchored** panel with a count (`Projection.unanchoredReactionIds`). They are never silently dropped. "Cannot reach any hub" means no arrow has an anchored hub at either end; such reactions are still drawn on the Unclassified hub, so they are listed and drawn (step 2.3).
- Clicking an arrow opens the reaction; expanding a hub reveals its specific species and their reactions (progressive disclosure, §11).

## 4. Stated versus inferred

| Edge origin | Example | Drawn |
|---|---|---|
| Stated | participant ref = ethanol; product ref = ethanal | solid |
| Inferred via class membership | ethanol ∈ 1° alcohols ⊂ alcohols → hub "Alcohols" | dotted |
| Inferred via transformation | generic transformation 1° alcohol → aldehyde | dotted |
| Derived relation | `feeds_into` computed from products/reactants | dotted, only on request |

Inferred edges are never presented as stated facts, and route search reports class-level matches as warnings on the step ("class-level match, verify substrate scope").

Selectivity styling (produces edges): `exclusive` solid heavy, `major` solid heavy, `minor` dashed, `trace` dotted light, `mixture_component` solid normal, `unspecified` solid normal. Line style and shape always carry meaning together with colour so the view works in greyscale and for colour-blind users (UI_ARCHITECTURE.md §3).

## 5. Direction and the precursor view

Arrows always point in the chemical direction (reactants → products). The **precursor explorer** traverses backwards from a target and lays the graph out right-to-left (`layoutDirection: 'reversed'`), but arrowheads still point forward. "Can be made from" never implies "can be converted back". Reversibility is shown only from `reversibility.kind` and `reverse_of` relationships (a ⇌ badge on the arrow, or a paired arrow for microscopic reverses).

## 6. Relationships: stored versus derived

Stored (curated by a person, `relationship` records):

| Type | Symmetric | Acyclic | Endpoints | Meaning |
|---|---|---|---|---|
| alternative_to | yes | no | reaction, route, reagent | achieves the same change another way |
| competing_with | yes | no | reaction, mechanism | occur under overlapping conditions and compete (SN2 vs E2) |
| reverse_of | yes | no | reaction, transformation | with `reverseKind` microscopic / synthetic / conceptual |
| commonly_confused_with | yes | no | reaction, species, class, reagent, named reaction, concept, mechanism | exam trap pairing (Cannizzaro vs Aldol) |
| mechanistically_related | yes | no | reaction, mechanism, named reaction | share a key mechanistic idea |
| prerequisite_of | no | yes | concept, reaction, named reaction, mechanism | learn A before B |
| follows | no | no | reaction, named reaction | typically taught/performed after |
| contrasts_with | yes | no | reaction, named reaction, mechanism, concept, reagent | deliberate contrast (Markovnikov vs peroxide effect) |
| related_to | yes | no | L1–L2 knowledge kinds | weak, catch-all |

Symmetric relationships are unique per unordered pair (REL-003); `from == to` is an error (REL-002); `prerequisite_of` cycles are errors (REL-005).

Derived (computed from data; storing them is forbidden by INV-11 and by the absence of any schema field):

| Derived relation | Computation |
|---|---|
| feeds_into | a product of R1 is a reactant of R2 (exact species = stated; via class = inferred) |
| same_transformation | reactions sharing a transformation ID |
| same_reagent_family | reactions whose reagent participants share a family |
| same_named_family | reactions under the same named-reaction ancestor |
| shares_mechanism | reactions/outcomes linked to the same mechanism (variant) |
| shares_participant | reactions sharing any participant substance |

`follows` (curated teaching order) and `feeds_into` (chemical connectivity) are different relations and may both exist.

## 7. Projection registry

Views are `ProjectionDefinition`s registered by `ViewKey`. Adding a view adds a definition; it never edits another projection.

| View | Seeds | Traversal | Output |
|---|---|---|---|
| navigator | anchors | hub roll-up (§3) | hubs + reaction arrows + Unclassified + Unanchored list |
| reaction_explorer | focus substance or reaction | bipartite BFS both directions, depth-limited | substances + reaction nodes |
| precursor_explorer | target substance | backwards over produces/consumes | reversed layout, forward arrows |
| reagent_explorer | reagent or family | reagent → participations → reactions | grouped by profile and family |
| named_reactions | named reaction family tree | family DAG + reactions via index | tree + reaction lists |
| mechanisms | mechanism | mechanism → outcomes → reactions | pathway + users |
| syllabus | topic tree | topic → mapped records, derived scope badges | tree + counts (not a free graph) |
| search | query | none (list) | results; opening a result sets focus |

A concept-map view is ARCHITECTURALLY SUPPORTED (new ViewKey + definition); it is not required now.

**`reaction_explorer` (step 2.4).** The canonical bipartite graph itself, never rolled up to hubs: one
`consumes` edge per qualifying participant, one `produces` edge per qualifying outcome product (every
product role — main, coproduct, byproduct — unlike the navigator's main-only arrows). Seeds are a focus
substance or reaction (unknown seeds are dropped, not phantom nodes); `traverse()` runs `direction: 'both'`
so the same bounded BFS discovers reactions from a substance and substances from a reaction. Excluded from
every edge and node, same as the navigator (§3): `spectator` participants, and any participant or product
whose display is `showAsNode: never` (still indexed — ADV-027, ADV-053). Intermediates are never read here:
they are not participants or products (ADV-054). Repeated participations of the same substance in one
reaction stay distinct edges, keyed by `participantId` (ADV-051, INV-26). Stages do not change the bipartite
shape — every participant of every stage still gets a `consumes` edge; stage grouping is a display concern
for the record itself, read directly, not a graph structure.

*Condition-variant filter* (ADV-008): `ProjectionRequest.conditionVariantId?: ConditionVariantId` (ADR-027)
narrows the focused reaction(s) to one variant. A participant holds under the selection when it is common
(listed under no `conditionVariant.participantIds`) or the selection is one of the variants that lists it;
an outcome holds when its `conditionVariantIds` is empty or contains the selection (DOMAIN_MODEL.md §6.3–§6.4).
Every edge still carries its full `conditionVariantIds` regardless of the filter, so a UI can label it.

## 8. Indexes

Maintained incrementally from each ChangeSet (`IndexEngine.apply`), identical to a full rebuild (INV-18, property test P-07): reverse references, definers of nested IDs (which records define an ID: uniqueness, REF-006), linkers of an ID (records whose rich text links to it: REF-008), participations by substance, productions by product, reactions by reagent / reagent family / named reaction (with descendants) / transformation / concept / mechanism, species by class (transitive), class ancestors, records by topic (transitive), topics of a record, relationships of a record, caveats for a record, records by folded name, anchors, display of a record. Query semantics (step 2.1): each record contributes only from its own content; joins across records happen at query time and are never stored. `reactionsByReagentFamily` joins reagents of the family to `reactionsByReagent`; `reactionsByNamedReaction` / `reactionsByConcept` add descendants on request. `reactionsByConcept` matches a reaction's `conceptIds`, `reactionTypes`, `mechanismClasses` and outcome `conceptIds` (not `prerequisiteConceptIds`); `reactionsByMechanism` matches `mechanismIds` and outcome `mechanism` links. `speciesInClass` lists species only (a reagent's `classIds` are not membership of a substrate class). `recordsInTopic` / `topicsOf` read `topic_mapping` records directly (topic ancestry is joined by the caller via `ancestorsOf('topic', �)`). Participations and productions are one entry per participant / outcome product (INV-26: never merged by endpoints). All lists are sorted and deduplicated; `displayOf` returns the lowest-ID display when PRS-001 is violated.

Indexes live in memory on the main thread and in the compute worker replica; they are never persisted as canonical data (a warm-start cache is allowed, keyed by revision). `apply` updates in place and returns the handle for the new revision; the previous handle is stale and throws on use (arrays already returned stay valid). A `replace` ChangeSet or a revision gap rebuilds.

## 9. Traversal, cycles and route search

- Every traversal is bounded by `TraversalLimits` (default depth 12, 400 nodes, 800 edges, 12 ms on the main thread) and an `AbortSignal`. When a limit is hit the projection returns `truncation` and the UI says so ("Showing 400 of ~1,250; refine or expand") — never a silent cut (INV-22).
- Visited sets are keyed by node ID and direction, so cycles (esterification ⇌ hydrolysis, A → B → A) terminate and render as two distinct arrows. A product equal to a reactant (RXN-017) renders as a self-loop glyph.
- **Route search** (compute worker): bounded best-first search over `(substance, steps used)` states. Moves follow produces edges of outcomes whose reactants include the current substance (exact species, or class membership as an inferred move). Side inputs (reagents, co-reactants not produced within the route) are assumed available unless `assumption: only_listed_inputs`. Ranking: fewer steps; then major/exclusive over minor; stated over inferred; published over draft; ties broken by reaction ID. Duplicate step sequences are removed by a deterministic key. Results include per-step warnings. Limits: `maxSteps` (default 5), `maxRoutes` (default 10), node/time budgets, cancellable.

## 10. Determinism

Edge IDs are hashes of `(view, from, to, semantic, reactionId, outcomeId, productId, participantId, relationshipId)`. Nodes and edges are sorted by ID; virtual nodes have stable keys. The same state and request always yield byte-identical projections (property test P-10), which makes layout caching and snapshot tests possible.

## 11. Behaviour at scale

- **Degree caps**: a node shows at most 12 neighbours per direction by default, ranked by exam scope, then selectivity, then name; the rest become a "+N more" overflow node that opens a virtualised list.
- **Bundling**: parallel edges between the same two nodes are bundled into one visual path with a count badge; expanding the bundle fans them out. Edges are never merged or deduplicated (INV-26).
- **Progressive disclosure**: initial navigator shows hubs only; expansion is explicit (double-click, Enter, "+" key) and remembered in `ExpansionState` (UI state).
- **Hub explosion** (a hub with 1,000 reactions): bundles + caps + overflow keep the scene under the render budget (RENDER_BUDGET 400 nodes / 800 edges); the full list is available in the inspector with virtualisation.

## 12. Topology cases the engine must handle

| Case | Expected projection |
|---|---|
| A → B (one reaction) | one arrow |
| A → B via two reactions | two edges, one bundle with count 2 |
| A → B → C and A → C | three arrows; no transitive reduction |
| A → B → A | two arrows, opposite directions; ⇌ badge only if `reverse_of`/equilibrium |
| Self-loop A → A | loop glyph + RXN-017 warning |
| One reaction, 2 reactants → 3 products | 2 consumes + 3 produces edges (reaction-centric view), or 3 arrows from the primary substrate hub (navigator) |
| Same product as major in R1, minor in R2 | two produces edges with different styles |
| Disconnected components | all shown in navigator (hubs) or listed as unanchored |
| Depth beyond limit | truncation notice + expandable frontier |
| 1,000 edges on one hub | bundles, overflow node, list |

The adversarial matrix (TEST_STRATEGY.md §5) turns each row into tests.
