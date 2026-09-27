/**
 * The cross-record indexes of docs/GRAPH_SEMANTICS.md §8 (step 2.1). Each record contributes only from
 * its own content (a reaction its participants and outcomes, a topic mapping its topic and target, …),
 * so retract-then-add per touched record equals a rebuild (INV-18). Anything that would need a second
 * record (reagent family of a participant, descendants of a concept) is joined at query time, never stored.
 */
import type { AnyRecord, EntityDisplay, NavigatorAnchor, RecordRef } from '../schema';
import type { Participation, Production } from './contracts';
import { compareStrings, Table } from './table';

const byId = (a: RecordRef, b: RecordRef): number => compareStrings(a.id, b.id);
const ref = (record: AnyRecord): RecordRef => ({ kind: record.kind, id: record.id });

export class DerivedTables {
  readonly participations = new Table<Participation>(
    (a, b) => compareStrings(a.reactionId, b.reactionId) || compareStrings(a.participantId, b.participantId),
  );
  readonly productions = new Table<Production>(
    (a, b) =>
      compareStrings(a.reactionId, b.reactionId) ||
      compareStrings(a.outcomeId, b.outcomeId) ||
      compareStrings(a.productId, b.productId),
  );
  /** Reaction IDs by the reagent record used as a participant. */
  readonly byReagent = new Table<string>(compareStrings);
  /** Reagent IDs by family (the join to reactions happens at query time). */
  readonly reagentsByFamily = new Table<string>(compareStrings);
  readonly byNamedReaction = new Table<string>(compareStrings);
  readonly byTransformation = new Table<string>(compareStrings);
  readonly byConcept = new Table<string>(compareStrings);
  readonly byMechanism = new Table<string>(compareStrings);
  /** Species by directly listed class. */
  readonly speciesByClass = new Table<RecordRef>(byId);
  /** Mapped records by topic; a record mapped twice appears twice (the query deduplicates). */
  readonly topicRecords = new Table<RecordRef>(byId);
  /** Topics by mapped record; the same topic can appear twice (the query deduplicates). */
  readonly topicsByRecord = new Table<string>(compareStrings);
  /** Relationship records by either endpoint. */
  readonly relationships = new Table<RecordRef>(byId);
  /** Caveat records by target. */
  readonly caveats = new Table<RecordRef>(byId);
  /** All anchors under one key, ordered by `order` then ID. */
  readonly anchors = new Table<NavigatorAnchor>(
    (a, b) => a.order - b.order || compareStrings(a.id, b.id),
  );
  readonly displays = new Table<EntityDisplay>((a, b) => compareStrings(a.id, b.id));

  addRecord(record: AnyRecord): void {
    const id = record.id;
    switch (record.kind) {
      case 'reaction': {
        for (const p of record.participants) {
          this.participations.add(id, p.ref.id, { reactionId: record.id, participantId: p.id, role: p.role });
        }
        const reagents = new Set(record.participants.filter((p) => p.ref.kind === 'reagent').map((p) => p.ref.id));
        for (const reagent of reagents) this.byReagent.add(id, reagent, id);
        for (const outcome of record.outcomes) {
          for (const product of outcome.products) {
            this.productions.add(id, product.ref.id, {
              reactionId: record.id,
              outcomeId: outcome.id,
              productId: product.id,
              selectivity: outcome.selectivity,
              productRole: product.role,
            });
          }
        }
        this.addAll(this.byNamedReaction, id, record.namedReactionIds);
        this.addAll(this.byTransformation, id, record.transformationIds);
        this.addAll(this.byConcept, id, [
          ...record.conceptIds,
          ...record.reactionTypes.map((c) => c.conceptId),
          ...record.mechanismClasses.map((c) => c.conceptId),
          ...record.outcomes.flatMap((o) => o.conceptIds),
        ]);
        this.addAll(this.byMechanism, id, [
          ...record.mechanismIds,
          ...record.outcomes.flatMap((o) => (o.mechanism === undefined ? [] : [o.mechanism.mechanismId])),
        ]);
        break;
      }
      case 'reagent':
        this.addAll(this.reagentsByFamily, id, record.families, id);
        break;
      case 'species':
        this.addAll(this.speciesByClass, id, record.classIds, ref(record));
        break;
      case 'topic_mapping':
        this.topicRecords.add(id, record.topicId, record.target);
        this.topicsByRecord.add(id, record.target.id, record.topicId);
        break;
      case 'relationship':
        this.addAll(this.relationships, id, [record.from.id, record.to.id], ref(record));
        break;
      case 'caveat':
        this.addAll(this.caveats, id, record.targets.map((t) => t.ref.id), ref(record));
        break;
      case 'navigator_anchor':
        this.anchors.add(id, '', record);
        break;
      case 'entity_display':
        this.displays.add(id, record.target.id, record);
        break;
      default:
        break;
    }
  }

  removeRecord(id: string): void {
    for (const table of this.all()) table.removeOwner(id);
  }

  commit(): void {
    for (const table of this.all()) table.commit();
  }

  /** One entry per distinct key: a record listing the same target twice contributes once. */
  private addAll<V>(table: Table<V>, owner: string, keys: readonly string[], value?: V): void {
    for (const key of new Set(keys)) table.add(owner, key, (value ?? owner) as V);
  }

  private all(): readonly Table<never>[] {
    return [
      this.participations,
      this.productions,
      this.byReagent,
      this.reagentsByFamily,
      this.byNamedReaction,
      this.byTransformation,
      this.byConcept,
      this.byMechanism,
      this.speciesByClass,
      this.topicRecords,
      this.topicsByRecord,
      this.relationships,
      this.caveats,
      this.anchors,
      this.displays,
    ] as unknown as readonly Table<never>[];
  }
}
