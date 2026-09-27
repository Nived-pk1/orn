/**
 * The complete index engine: the part-1 indexes (`coreIndexEngine`) plus the cross-record indexes of
 * step 2.1 (`DerivedTables`). `apply` updates both in place and returns the handle for the new revision;
 * the previous handle is stale and throws on use, like the part-1 handle. Results equal a rebuild (INV-18).
 */
import type {
  AnyRecord,
  CanonicalState,
  ClassId,
  ConceptId,
  EntityDisplay,
  MechanismId,
  NamedReactionId,
  NavigatorAnchor,
  ReactionId,
  ReagentFamily,
  ReagentId,
  RecordKind,
  RecordRef,
  TopicId,
  TransformationId,
} from '../schema';
import { RECORD_KINDS } from '../schema';
import type { ChangeSet } from '../dataset/contracts';
import type { Referrer } from '../references/contracts';
import type { CoreIndexes, HierarchyKind, IndexEngine, NavigatorRollupIndex, Participation, Production, ReadonlyIndexes } from './contracts';
import { DerivedTables } from './derived';
import { coreIndexEngine } from './engine';
import { NavigatorRollup } from './navigator-rollup';
import { compareStrings, sortedUnion } from './table';

/** Shared, mutable state of one index lineage; `generation` retires older handles. */
interface Lineage {
  readonly derived: DerivedTables;
  /** Mutable: replaced wholesale on an anchor/class-hierarchy/display change (step 2.9); see `apply`. */
  navRollup: NavigatorRollup;
  generation: number;
}

/** The navigator roll-up's `HubBasis` view of the current core + derived tables (no `core/graph` import). */
function hubBasisOf(core: CoreIndexes, derived: DerivedTables): { anchors: readonly NavigatorAnchor[]; get(id: string): AnyRecord | undefined; displayOf(ref: RecordRef): EntityDisplay | undefined } {
  return {
    anchors: derived.anchors.get(''),
    get: (id) => core.get(id),
    displayOf: (ref) => derived.displays.get(ref.id)[0],
  };
}

function buildNavigatorRollup(state: CanonicalState, core: CoreIndexes, derived: DerivedTables): NavigatorRollup {
  const rollup = new NavigatorRollup(hubBasisOf(core, derived));
  for (const reaction of Object.values(state.records.reaction)) rollup.addReaction(reaction);
  rollup.commit();
  return rollup;
}

/** Record kinds whose creation, update or deletion can shift hub resolution for reactions that never
 * reference them directly (a new/moved anchor, a reparented class, a display flip) — step 2.9 rebuilds
 * just the navigator roll-up for these, rather than trying to trace every indirect dependent. */
const HUB_SET_KINDS: ReadonlySet<RecordKind> = new Set(['navigator_anchor', 'class', 'entity_display']);

/** Reaction IDs that reference `id` as a participant or a product, from the already-updated derived tables. */
function reactionsReferencing(derived: DerivedTables, id: string): ReadonlySet<ReactionId> {
  const ids = new Set<ReactionId>();
  for (const p of derived.participations.get(id)) ids.add(p.reactionId);
  for (const p of derived.productions.get(id)) ids.add(p.reactionId);
  return ids;
}

const CLASS_MEMBERSHIP_KINDS: ReadonlySet<RecordKind> = new Set(['species', 'reagent']);
function classIdsOf(record: AnyRecord | undefined): readonly string[] {
  return record !== undefined && CLASS_MEMBERSHIP_KINDS.has(record.kind) ? (record as { classIds: readonly string[] }).classIds : [];
}
function sameClassIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

const STALE = 'Stale index handle: use the value returned by the latest apply()';
const recordsOf = (state: CanonicalState, kind: RecordKind): Readonly<Record<string, AnyRecord>> =>
  state.records[kind] as Readonly<Record<string, AnyRecord>>;

/** Sorted union of references, one per record ID. */
function refUnion(lists: Iterable<readonly RecordRef[]>): RecordRef[] {
  const byId = new Map<string, RecordRef>();
  for (const list of lists) for (const item of list) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => compareStrings(a.id, b.id));
}

class FullHandle implements ReadonlyIndexes {
  private readonly generation: number;

  constructor(
    private readonly core: CoreIndexes,
    private readonly lineage: Lineage,
  ) {
    this.generation = lineage.generation;
  }

  get revision(): number {
    return this.core.revision;
  }

  /** The shared parts, for `apply`; refuses once a later apply has taken over. */
  take(): { readonly core: CoreIndexes; readonly lineage: Lineage } {
    return { core: this.live(), lineage: this.lineage };
  }

  private live(): CoreIndexes {
    if (this.lineage.generation !== this.generation) throw new Error(STALE);
    return this.core;
  }

  private get tables(): DerivedTables {
    this.live();
    return this.lineage.derived;
  }

  get(id: string): AnyRecord | undefined {
    return this.live().get(id);
  }
  referrersOf(id: string): readonly Referrer[] {
    return this.live().referrersOf(id);
  }
  definersOf(id: string): readonly RecordRef[] {
    return this.live().definersOf(id);
  }
  linkersOf(id: string): readonly RecordRef[] {
    return this.live().linkersOf(id);
  }
  byFoldedName(kind: RecordKind, folded: string): readonly RecordRef[] {
    return this.live().byFoldedName(kind, folded);
  }
  ancestorsOf(kind: HierarchyKind, id: string): readonly string[] {
    return this.live().ancestorsOf(kind, id);
  }
  descendantsOf(kind: HierarchyKind, id: string): readonly string[] {
    return this.live().descendantsOf(kind, id);
  }
  classAncestors(id: ClassId): readonly ClassId[] {
    return this.live().classAncestors(id);
  }

  participationsOf(substance: RecordRef): readonly Participation[] {
    return this.tables.participations.get(substance.id);
  }
  productionsOf(product: RecordRef): readonly Production[] {
    return this.tables.productions.get(product.id);
  }
  reactionsByReagent(id: ReagentId): readonly ReactionId[] {
    return this.tables.byReagent.get(id) as readonly ReactionId[];
  }
  reactionsByReagentFamily(family: ReagentFamily): readonly ReactionId[] {
    const t = this.tables;
    return sortedUnion(t.reagentsByFamily.get(family).map((reagent) => t.byReagent.get(reagent))) as ReactionId[];
  }
  reactionsByNamedReaction(id: NamedReactionId, opts: { readonly includeDescendants: boolean }): readonly ReactionId[] {
    const t = this.tables;
    const ids = opts.includeDescendants ? [id, ...this.descendantsOf('named_reaction', id)] : [id];
    return sortedUnion(ids.map((one) => t.byNamedReaction.get(one))) as ReactionId[];
  }
  reactionsByTransformation(id: TransformationId): readonly ReactionId[] {
    return this.tables.byTransformation.get(id) as readonly ReactionId[];
  }
  reactionsByConcept(id: ConceptId, opts: { readonly includeDescendants: boolean }): readonly ReactionId[] {
    const t = this.tables;
    const ids = opts.includeDescendants ? [id, ...this.descendantsOf('concept', id)] : [id];
    return sortedUnion(ids.map((one) => t.byConcept.get(one))) as ReactionId[];
  }
  reactionsByMechanism(id: MechanismId): readonly ReactionId[] {
    return this.tables.byMechanism.get(id) as readonly ReactionId[];
  }
  speciesInClass(id: ClassId, opts: { readonly transitive: boolean }): readonly RecordRef[] {
    const t = this.tables;
    const ids = opts.transitive ? [id, ...this.descendantsOf('class', id)] : [id];
    return refUnion(ids.map((one) => t.speciesByClass.get(one)));
  }
  recordsInTopic(id: TopicId, opts: { readonly transitive: boolean }): readonly RecordRef[] {
    const t = this.tables;
    const ids = opts.transitive ? [id, ...this.descendantsOf('topic', id)] : [id];
    return refUnion(ids.map((one) => t.topicRecords.get(one)));
  }
  topicsOf(ref: RecordRef): readonly TopicId[] {
    return sortedUnion([this.tables.topicsByRecord.get(ref.id)]) as TopicId[];
  }
  relationshipsOf(ref: RecordRef): readonly RecordRef[] {
    return this.tables.relationships.get(ref.id);
  }
  caveatsFor(ref: RecordRef): readonly RecordRef[] {
    return this.tables.caveats.get(ref.id);
  }
  anchors(): readonly NavigatorAnchor[] {
    return this.tables.anchors.get('');
  }
  displayOf(ref: RecordRef): EntityDisplay | undefined {
    return this.tables.displays.get(ref.id)[0];
  }
  navigatorRollup(): NavigatorRollupIndex {
    this.live();
    return this.lineage.navRollup;
  }
}

function build(state: CanonicalState, revision = 0): ReadonlyIndexes {
  const derived = new DerivedTables();
  for (const kind of RECORD_KINDS) {
    for (const record of Object.values(recordsOf(state, kind))) derived.addRecord(record);
  }
  derived.commit();
  const core = coreIndexEngine.build(state, revision);
  const navRollup = buildNavigatorRollup(state, core, derived);
  return new FullHandle(core, { derived, navRollup, generation: 0 });
}

function apply(previous: ReadonlyIndexes, changes: ChangeSet, next: CanonicalState): ReadonlyIndexes {
  if (!(previous instanceof FullHandle)) throw new TypeError('apply() needs indexes built by this engine');
  const { core, lineage } = previous.take();
  if (changes.cause === 'replace' || changes.revision !== core.revision + 1) return build(next, changes.revision);

  // Snapshot what the navigator roll-up's class-membership update (below) needs from the OLD state,
  // before anything is advanced: `core` and `lineage.derived` are about to move to the next revision.
  const oldClassIds = new Map<string, readonly string[]>();
  for (const ref of changes.updated) if (CLASS_MEMBERSHIP_KINDS.has(ref.kind)) oldClassIds.set(ref.id, classIdsOf(core.get(ref.id)));
  const hubSetChanged = [...changes.created, ...changes.updated, ...changes.deleted].some((ref) => HUB_SET_KINDS.has(ref.kind));

  const touched = [...changes.created, ...changes.updated].map((ref) => {
    const record = recordsOf(next, ref.kind)[ref.id];
    if (record === undefined) throw new Error(`ChangeSet names ${ref.id} but the next state has no such record`);
    return record;
  });
  const nextCore = coreIndexEngine.apply(core, changes, next);
  for (const ref of changes.deleted) lineage.derived.removeRecord(ref.id);
  for (const record of touched) {
    lineage.derived.removeRecord(record.id);
    lineage.derived.addRecord(record);
  }
  lineage.derived.commit();

  // Navigator roll-up (step 2.9): a hub-set change (anchor/class/display) can shift resolution for
  // reactions that never reference the changed record, so it rebuilds just this index. Otherwise, only
  // touched reactions and — for a class-membership change — the reactions referencing the changed
  // species/reagent are recomputed; everything else in the roll-up is untouched. Either way, it must be
  // rebound to this commit's indexes first: it outlives many commits, but `core.get`/`displayOf` close
  // over one commit's handle, which the `coreIndexEngine.apply` above just retired.
  lineage.navRollup.rebind(hubBasisOf(nextCore, lineage.derived));
  if (hubSetChanged) {
    lineage.navRollup = buildNavigatorRollup(next, nextCore, lineage.derived);
  } else {
    const touchedReactionIds = new Set<ReactionId>();
    for (const ref of changes.deleted) if (ref.kind === 'reaction') lineage.navRollup.removeReaction(ref.id);
    for (const record of touched) if (record.kind === 'reaction') touchedReactionIds.add(record.id);
    for (const ref of changes.updated) {
      if (!CLASS_MEMBERSHIP_KINDS.has(ref.kind)) continue;
      const newIds = classIdsOf(recordsOf(next, ref.kind)[ref.id]);
      if (sameClassIds(oldClassIds.get(ref.id) ?? [], newIds)) continue;
      lineage.navRollup.invalidateHubResolution(ref.id);
      for (const reactionId of reactionsReferencing(lineage.derived, ref.id)) touchedReactionIds.add(reactionId);
    }
    // A deleted species/reagent still referenced by a reaction's participant/product (a dangling ref the
    // reaction record itself never changed) must resolve to Unclassified now, not its last cached hub —
    // ownership of `participations`/`productions` entries is the referencing reaction's, so `derived`
    // still names it correctly even after `removeRecord` retracted the deleted record's own contributions.
    for (const ref of changes.deleted) {
      if (!CLASS_MEMBERSHIP_KINDS.has(ref.kind)) continue;
      lineage.navRollup.invalidateHubResolution(ref.id);
      for (const reactionId of reactionsReferencing(lineage.derived, ref.id)) touchedReactionIds.add(reactionId);
    }
    for (const reactionId of touchedReactionIds) {
      const reaction = next.records.reaction[reactionId];
      lineage.navRollup.removeReaction(reactionId);
      if (reaction !== undefined) lineage.navRollup.addReaction(reaction);
    }
    lineage.navRollup.commit();
  }

  lineage.generation += 1;
  return new FullHandle(nextCore, lineage);
}

export const indexEngine: IndexEngine = { build, apply };
