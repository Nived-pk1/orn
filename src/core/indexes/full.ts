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
import type { CoreIndexes, HierarchyKind, IndexEngine, Participation, Production, ReadonlyIndexes } from './contracts';
import { DerivedTables } from './derived';
import { coreIndexEngine } from './engine';
import { compareStrings, sortedUnion } from './table';

/** Shared, mutable state of one index lineage; `generation` retires older handles. */
interface Lineage {
  readonly derived: DerivedTables;
  generation: number;
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
}

function build(state: CanonicalState, revision = 0): ReadonlyIndexes {
  const derived = new DerivedTables();
  for (const kind of RECORD_KINDS) {
    for (const record of Object.values(recordsOf(state, kind))) derived.addRecord(record);
  }
  derived.commit();
  return new FullHandle(coreIndexEngine.build(state, revision), { derived, generation: 0 });
}

function apply(previous: ReadonlyIndexes, changes: ChangeSet, next: CanonicalState): ReadonlyIndexes {
  if (!(previous instanceof FullHandle)) throw new TypeError('apply() needs indexes built by this engine');
  const { core, lineage } = previous.take();
  if (changes.cause === 'replace' || changes.revision !== core.revision + 1) return build(next, changes.revision);
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
  lineage.generation += 1;
  return new FullHandle(nextCore, lineage);
}

export const indexEngine: IndexEngine = { build, apply };
