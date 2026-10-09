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
- *2026-10-08 (step 5.5a review, item d).* On the hub overview an arrow whose BOTH ends are hub nodes (anchored hubs or Unclassified) is drawn by its selectivity only: `inferred` does not make it dotted, because every hub-to-hub arrow is a roll-up and the dots would say nothing. Its accessible name and title say "through class membership" when it is inferred. An arrow with a member end keeps the §4 rule (inferred is dotted). Replaces the "dotted everywhere" reading of §3 and §4 for the navigator.
- Participants that are not the carried substrate (reagents, catalysts, co-reactants, solvents) appear as arrow labels following `reaction_scheme` placements or role defaults (DOMAIN_MODEL.md §6.2). A species with `entity_display.showAsNode = never` (water) is never a node.
- Arrows go to the hub of each **main** product (coproducts and byproducts are not drawn). The carried substrate is the participant flagged `isPrimarySubstrate`, else the first reactant; spectators and never-a-node species never qualify. A `showAsNode = never` record is not a hub even when anchored (step 2.3).
- Reactions that cannot reach any hub are listed in the **Unanchored** panel with a count (`Projection.unanchoredReactionIds`). They are never silently dropped. "Cannot reach any hub" means no arrow has an anchored hub at either end; such reactions are still drawn on the Unclassified hub, so they are listed and drawn (step 2.3).
- Clicking an arrow opens the reaction; expanding a hub reveals its specific species and their reactions (progressive disclosure, §11).
- *2026-10-09 (ADR-037).* Expanding a hub IN THE NAVIGATOR is replaced by its family page (step 5.5b): the page lists the reactions of and the preparations of the family from the roll-up index. The projection's expansion (below) stays in core for later views; the navigator no longer asks for it.
- **Hub expansion (step 5.4c, 2026-10-07).** `request.expansion.expanded = { nodeId: a hub ID, direction }`. An expanded hub shows its MEMBERS: the substances that resolve to it and are the carried substrate (direction `out`) or a main product (`in`) of its arrows (both for `both`). A substance that IS the hub record is not a member. A shown member is a node (`role: member`, depth 1) with one `membership` edge to its hub, inferred (a member reaches a real hub through class membership); the edge to Unclassified is not inferred. Its arrows leave the hub's pairs and form pairs of their own; when the other end is a shown member of an expanded hub the pair runs member to member. Unclassified expands like any hub. `request.focus` and `expansion.collapsedEdgeIds` are ignored by the navigator for now (Phase 7); collapsing is removing the entry.

## 4. Stated versus inferred

| Edge origin | Example | Drawn |
|---|---|---|
| Stated | participant ref = ethanol; product ref = ethanal | solid |
| Inferred via class membership | ethanol ∈ 1° alcohols ⊂ alcohols → hub "Alcohols" | dotted |
| Inferred via transformation | generic transformation 1° alcohol → aldehyde | dotted |
| Derived relation | `feeds_into` computed from products/reactants | dotted, only on request |

Inferred edges are never presented as stated facts, and route search reports class-level matches as warnings on the step ("class-level match, verify substrate scope").

Selectivity styling (produces edges): `exclusive` solid heavy, `major` solid heavy, `minor` dashed, `trace` dotted light, `mixture_component` solid normal, `unspecified` solid normal. Line style and shape always carry meaning together with colour so the view works in greyscale and for colour-blind users (UI_ARCHITECTURE.md §3).

*Scene styling (step 5.3, 2026-10-07).* An inferred edge is dotted whatever its selectivity and keeps the weight of its selectivity (heavy for exclusive and major, light for trace, normal otherwise); minor stated edges are dashed, trace stated edges dotted. A bundle is ONE drawn path: dotted only when every drawn edge of it is inferred, otherwise the stroke of its best-ranked edge; the weight and arrowhead of its best-ranked edge (rank: exclusive, major, mixture_component, unspecified, minor, trace; then edge ID); it shows its TOTAL, not the number of edges materialised. Membership edges are solid light and overflow edges dashed light, both without an arrowhead.
*2026-10-08 (step 5.5a review, item d).* Hub-to-hub arrows: stroke by selectivity only, inferred is not dotted (see §3 dated line). Member-end arrows: unchanged.

*Arrow text names (2026-10-08, step 5.5a review, item e; replaces the 5.4a decision (2) for every view that uses `arrowTextOf`).* `originalText` wins; a SOLVENT participant is written by its name; any other species, and a reagent backed by ONE species, by its formula when the formula has at most 7 characters, else by its name; a reagent without a species by its name. A length rule, never a name rule.

*Arrow text conditions (2026-10-08, step 5.5a part 3, item l; decision 5 of the 5.4b review in PROGRESS.md; wording in `src/core/graph/condition-text.ts`).* The BELOW side, after the participant parts of the same stage: the stage's own fields, overridden field by field by the arrow's condition variant only when the arrow has exactly one variant and it overrides that stage; at most 3 condition parts a side and ONE `more` part a side that counts everything not shown; order temperature, pressure, light, medium, time, activation, atmosphere, anhydrous, other; `air` and the medium are written; a gas is a formula part; free text only when no structured part was written. Units and enum words the decision does not name are the schema's words (listed in PROGRESS).

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
| navigator | anchors | hub roll-up (§3), per hub pair (§11) | hubs (+ members of expanded hubs) + reaction arrows bundled per pair with full totals + Unclassified + Unanchored list |
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

**`precursor_explorer` (step 2.5).** "What makes this": bounded backward BFS from a target substance or
reaction, same bipartite node/edge shape as `reaction_explorer` (reused builders — same edge IDs would
collide across views if `view` were not part of the identity hash, §10), but asymmetric: a substance node
never looks forward (what consumes it), only backward for its producers; a reaction node, once reached from
either side, reveals its full consumes *and* produces edges (ADV-003 no transitive reduction, ADV-006,
ADV-048 — ordinary reactants/products of a reached reaction are shown for context, then searched backward
in their own turn like any other substance). Every edge's `layoutDirection` is `'reversed'` (§5); the
chemical `from`/`to` direction never flips.

*Degree cap and overflow* (§11, ADV-012 projection part, ADV-052): a substance with more than
`DEFAULT_DEGREE_CAP` (12) qualifying producers keeps the best-ranked ones (exam scope, then selectivity,
then name, then edge ID) and collapses the rest into one virtual overflow node (`GraphNode.role: 'overflow'`,
`EdgeSemantic: 'overflow'`, ADR-028) whose `hidden.incoming` carries the collapsed count. The overflow edge
carries no `reactionId` (it stands for many, never one real participation/production) and is exempt from the
INV-26 participation/production check for that reason, same as any edge with no `reactionId`. Only a
substance's producer count is capped; a single reaction's own participant/product count is already
schema-bounded (`LIMITS`) and never capped.

*⇌ rule* (§5, ADV-004, ADV-056; reviewer decision, no schema change): drawn only between the produces edges
of a `reverse_of` pair of reactions whose endpoints mirror each other — R1 carries its substrate to R2's
main product and R2 carries its substrate to R1's main product. Implemented by tagging both edges'
`relationshipId`/`relationshipType` (already on `GraphEdge`, unused until now) rather than a new edge or
field. `reversibility.kind: reversible_under_other_conditions` alone never triggers it — only a curated,
mirrored `reverse_of` relationship does.

*Bundling* (§11, ADV-002, ADV-007 widened): `kit.ts`'s `bundleEdges` groups parallel edges by `(from, to)`
into one `EdgeBundle` per pair with 2+ edges; edges are never merged (INV-26). Shared by `navigator`,
`reaction_explorer` and `precursor_explorer` — the navigator's bundles were empty through steps 2.3–2.4
(open item, now closed).

**`reagent_explorer`, `named_reactions`, `mechanisms` (step 2.6).** One hop each, never a further BFS —
matching their registry-table row ("reagent → participations → reactions", "family DAG + reactions via
index", "mechanism → outcomes → reactions"): a reaction reached from any of them is a dead end, same as
`reaction_explorer` is for the others. `reagent_explorer` seeds on a reagent and finds reactions via its own
`participationsOf` (`uses_reagent` edges, spectators excluded, standard filters applied — GRAPH_SEMANTICS.md
§2). `named_reactions` seeds on a named reaction and walks its family DAG (`parentIds`, child → parent, the
same "specific → general" `membership` convention as class membership, §1) *and* full DAG in both
directions — climbing to a parent then re-expanding its other children is intentional here (see a family
means seeing the whole family, unlike syllabus below) — plus the reactions that name it (`namedReactionIds`).
`mechanisms` seeds on a mechanism; a `uses_mechanism` edge (ADR-029) connects each reaction that uses it, at
reaction level (`mechanismIds`, no `outcomeId`) and/or per outcome (`outcome.mechanism`, with `outcomeId` —
ADV-055: two outcomes linking different variants of the same mechanism get two distinct edges, each
resolvable back to its own variant via `outcomeId`, since only one variant is possible per outcome). A
mechanism's own variants/steps ("pathway") are nested data, read directly off the record, never nodes.

*Classification edges never carry `reactionId`.* A `membership`/reaction-level `uses_mechanism` edge from a
reaction is a **classification** (which family, which topic), not a participation or production — and a
reaction may validly carry more than one (two named reactions, two topics, two reaction-level mechanisms).
INV-26 is deliberately endpoint-independent for edges that *do* carry `reactionId` ("no two edges claim the
same one, whatever their endpoints" — GRAPH_SEMANTICS.md §10, checked by the projection harness), so setting
it on these would make two *legitimately distinct* classifications of the same reaction collide. They omit
it; the reaction is still `edge.from`. (Caught by the harness itself the first time `syllabus` ran over the
demo's cross-mapped reaction — see PROGRESS.md step 2.6.)

**`syllabus` (step 2.6).** The version-independent topic tree plus the records mapped to each topic
(ADV-057: a cross-chapter record maps directly to more than one topic, so it appears once under each — never
merged, never picked one). Scope is the closure of ancestors + descendants of the focused topic(s) (or of
every root topic, with no focus), computed once via `ancestorsOf`/`descendantsOf('topic', …)` — deliberately
*not* a bidirectional walk like `named_reactions`: climbing to an ancestor must never re-expand that
ancestor's other children, or every query would silently become "the whole tree" and defeat ADV-057's
per-topic scoping (this was the bug the harness caught, above). Records mapped to a topic are
`recordsInTopic(topicId, { transitive: false })` — a record shows under its own topic only; rolling up
through a descendant is the tree's job, not double-counted. "Derived scope badges" reuse the shared
`outside_scope` node flag (`flagsOf`, backed by `ctx.scopeOf` — see `createScopeOf` below); the full
official/prerequisite/enrichment taxonomy is not yet a node flag (open item). Bounded like `navigator`
(candidates computed, then a sorted prefix admitted, INV-22) rather than `traverse()`, since the tree is
built from two index calls per topic, not a neighbour-discovery function.

**Derived exam scope** (docs/JEE_ONTOLOGY.md §4, step 2.6): `createScopeOf(indexes, examId, examVersionId): ScopeOf`
(`src/core/graph/scope.ts`) is the reference implementation of `ProjectionContext.scopeOf`. Pure and
index-backed only — no full-table scan: `topic_mapping.target` and `exam_relevance.target` are registered
references, so "which mappings/overrides point at this record" is `referrersOf(ref.id)` filtered by path
(`kit.ts`'s `referencing`, also used by `named_reactions` and `syllabus` for their own reverse lookups:
named-reaction children via `parentIds[]`, topic children via `parentId`). Order: (1) explicit
`exam_relevance` override, version-specific beating version-agnostic, ties broken by precedence official >
prerequisite > enrichment > outside (CUR-004 already flags the underlying multi-override data issue; this
is just deterministic resolution); (2) mapped topics plus their ancestors against the exam version's
coverage, `official` unless every mapping is enrichment-role and covered, `outside` if mapped but none
covered; (3) for a concept only, one hop of `prerequisiteConceptIds` or a `prerequisite_of` relationship to
a record whose *direct* (non-prerequisite) scope is official; (4) otherwise `unmapped`. Wiring `ctx.scopeOf`
to the request's `filters.examId`/`examVersionId` (which exam version is "active") is a composition-root
concern for a later phase; this step delivers and tests the pure computation.

## 8. Indexes

Maintained incrementally from each ChangeSet (`IndexEngine.apply`), identical to a full rebuild (INV-18, property test P-07): reverse references, definers of nested IDs (which records define an ID: uniqueness, REF-006), linkers of an ID (records whose rich text links to it: REF-008), participations by substance, productions by product, reactions by reagent / reagent family / named reaction (with descendants) / transformation / concept / mechanism, species by class (transitive), class ancestors, records by topic (transitive), topics of a record, relationships of a record, caveats for a record, records by folded name, anchors, display of a record. The navigator's hub roll-up (`navigatorRollup()`, step 2.9, ADR-030) is the same shape: every reaction's carried substrate and main-product candidates, resolved to hubs once and aggregated per hub (`candidatesFrom`/`candidatesTo`), so `navigatorProjection.build` never scans `state.records.reaction` itself — cost is proportional to hub count and output, not to total reactions. The roll-up also keeps a per-pair table (step 5.4c, 2026-10-07): every ordered (fromHub, toHub) pair with all of its candidates ranked for drawing (selectivity, then reaction, outcome, product ID), maintained in the same retract-then-add step and proved by P-07; an unfiltered overview reads pair sizes and best arrows from it, a filtered one counts by scan (the filters are per reaction). Candidates carry their substrate and main-product refs. An anchor, class-hierarchy or display change rebuilds this one index (hub resolution can shift for reactions that never reference the changed record directly); a class-membership change (a species'/reagent's `classIds`) recomputes only the reactions that reference it.

Query semantics (step 2.1): each record contributes only from its own content; joins across records happen at query time and are never stored. `reactionsByReagentFamily` joins reagents of the family to `reactionsByReagent`; `reactionsByNamedReaction` / `reactionsByConcept` add descendants on request. `reactionsByConcept` matches a reaction's `conceptIds`, `reactionTypes`, `mechanismClasses` and outcome `conceptIds` (not `prerequisiteConceptIds`); `reactionsByMechanism` matches `mechanismIds` and outcome `mechanism` links. `speciesInClass` lists species only (a reagent's `classIds` are not membership of a substrate class). `recordsInTopic` / `topicsOf` read `topic_mapping` records directly (topic ancestry is joined by the caller via `ancestorsOf('topic', …)`). Participations and productions are one entry per participant / outcome product (INV-26: never merged by endpoints). All lists are sorted and deduplicated; `displayOf` returns the lowest-ID display when PRS-001 is violated.

Indexes live in memory on the main thread and in the compute worker replica; they are never persisted as canonical data (a warm-start cache is allowed, keyed by revision). `apply` updates in place and returns the handle for the new revision; the previous handle is stale and throws on use (arrays already returned stay valid). A `replace` ChangeSet or a revision gap rebuilds.

## 9. Traversal, cycles and route search

- Every traversal is bounded by `TraversalLimits` (default depth 12, 400 nodes, 800 edges, 12 ms on the main thread) and an `AbortSignal`. When a limit is hit the projection returns `truncation` and the UI says so ("Showing 400 of ~1,250; refine or expand") — never a silent cut (INV-22).
- Visited sets are keyed by node ID and direction, so cycles (esterification ⇌ hydrolysis, A → B → A) terminate and render as two distinct arrows. A product equal to a reactant (RXN-017) renders as a self-loop glyph.
- **Route search** (compute worker): bounded best-first search over `(substance, steps used)` states. Moves follow produces edges of outcomes whose reactants include the current substance (exact species, or class membership as an inferred move). Side inputs (reagents, co-reactants not produced within the route) are assumed available unless `assumption: only_listed_inputs`. Ranking: fewer steps; then major/exclusive over minor; stated over inferred; published over draft; ties broken by reaction ID. Duplicate step sequences are removed by a deterministic key. Results include per-step warnings. Limits: `maxSteps` (default 5), `maxRoutes` (default 10), node/time budgets, cancellable.

## 10. Determinism

Edge IDs are hashes of `(view, from, to, semantic, reactionId, outcomeId, productId, participantId, relationshipId)`. Nodes and edges are sorted by ID; virtual nodes have stable keys. The same state and request always yield byte-identical projections (property test P-10), which makes layout caching and snapshot tests possible. Where a `maxEdges`/`maxNodes` limit truncates candidates *before* that final sort (the navigator's admission pass, step 2.9), the pre-truncation order is itself part of determinism: candidates are sorted by `(reactionId, outcomeId, productId)`, never by an incidental scan or index-iteration order, so which edges survive truncation does not depend on how they were discovered. **Step 5.4c (2026-10-07) replaces this for the navigator**: it no longer cuts a candidate prefix. Pairs are admitted by `(total descending, from, to)`, and the arrows drawn inside a pair are chosen by rank (selectivity, then reaction, outcome and product ID); the result depends on the data, never on IDs of anything but ties.

## 11. Behaviour at scale

- **Degree caps**: a node shows at most 12 neighbours per direction by default, ranked by exam scope, then selectivity, then name; the rest become a "+N more" overflow node that opens a virtualised list.
- **Bundling**: parallel edges between the same two nodes are bundled into one visual path with a count badge; expanding the bundle fans them out. Edges are never merged or deduplicated (INV-26).
- **Progressive disclosure**: initial navigator shows hubs only; expansion is explicit (double-click, Enter, "+" key) and remembered in `ExpansionState` (UI state).
- **Navigator overview per ordered node pair (step 5.4c, 2026-10-07; contract amendment, PROGRESS.md "Amendments").** The overview is built per ordered PAIR (from, to) of nodes (hubs, or members of expanded hubs). `total(pair)` is the number of its candidates (reaction, outcome, main product) after the request's filters. Nodes: every real hub up to `maxNodes`, plus Unclassified when needed. Pairs between shown nodes are ordered by `(total descending, from, to)` and the first `limits.maxEdges` are admitted: `maxEdges` bounds drawn PATHS (pairs), after the structural membership and overflow edges of expanded hubs, which count against it. Edges are real candidates, never merged (INV-26), ranked inside a pair by selectivity (`exclusive`, `major`, `mixture_component`, `unspecified`, `minor`, `trace`), then reaction, outcome and product ID. Pass 1: every admitted pair materialises its best-ranked edge. Pass 2: the rest of the edge budget goes to pairs in `(total ascending, from, to)` order, each taking up to `min(total, DEFAULT_DEGREE_CAP)` edges in rank order until it is spent. So `Projection.edges` never exceeds `maxEdges`, small pairs are complete and a small dataset keeps every edge. Every admitted pair with two or more arrows is an `EdgeBundle` with its materialised `edgeIds` and its FULL `total`; a pair from a hub to itself is an ordinary pair with `from === to` (drawn as a loop). Exam scope and name are NOT ranking keys in the overview build (a scope lookup per candidate would break the 16 ms row); the full, sorted list of a pair is read from the roll-up index on demand (step 5.5b).
- **`hidden` and truncation of the overview (step 5.4c).** `hidden` on a node is exact: the candidates of pairs that are NOT admitted, counted outgoing at the pair's from node and incoming at its to node (when shown). `Truncation` gains the optional `hiddenPairs` and `hiddenEdges` (pairs and candidates that no admitted pair represents). The truncation is null when every pair is admitted, even if not every edge is materialised (the totals say it all). For every request, the totals of the admitted pairs plus the hidden candidates equal the filtered candidates (property test).
- **Hub expansion limits (step 5.4c).** At most `DEFAULT_DEGREE_CAP` members per hub and direction are shown, ranked by their number of arrows, then ID; the rest stay inside the hub's own pairs and are announced by ONE overflow node per hub (`virtual:overflow:<hub>`, `role: overflow`) with an `overflow` edge to the hub; its `hidden` holds the arrows it stands for and `hiddenMembers` how many members (ADR-028). `maxNodes` also counts member and overflow nodes; hubs are expanded in ID order and the first expansion that does not fit (nodes, or edges for the one structural edge each node has), and every one after it, is not applied: the truncation says `max_nodes` (or `max_edges`) and `hiddenNodeEstimate` counts the members not shown.
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
