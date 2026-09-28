/**
 * L3 rules for species, classes, reagents and the parent hierarchies (SPC-, CLS-, RGT-, HIER-).
 * Name rules compare canonical names through the folded-name index; hierarchy rules use the
 * ancestry index and declare their peers so incremental validation finds every affected record.
 */
import { closure, parentIdsOf } from '../../indexes/hierarchy';
import type { HierarchyKind } from '../../indexes/contracts';
import { foldedNamesOf } from '../../indexes/names';
import type { AnyRecord, ChemicalClass, RecordKind, RecordRef, Species } from '../../schema';
import { TOPIC_KINDS } from '../../schema';
import { fold } from '../../text';
import type { RuleContext, ValidationRule } from '../contracts';
import { MAX_RELATED, MAX_WALK_NODES, NO_REFERENCED_READS, allOfKinds, asRef, asRefs, at, existing, rule } from './helpers';

type Named = Species | ChemicalClass;
const fold_ = (text: string | undefined): string => (text === undefined ? '' : fold(text));

/** Records of `kind` sharing this record's canonical name, unless a different qualifier tells them apart. */
function twinsOf(record: Named, ctx: RuleContext, kind: RecordKind): AnyRecord[] {
  const folded = fold_(record.names.canonical);
  const qualifier = fold_(record.names.qualifier);
  const others = existing(ctx, ctx.indexes.byFoldedName(kind, folded).filter((ref) => ref.id !== record.id));
  return others.filter((other) => {
    if (other.kind !== 'species' && other.kind !== 'class') return false;
    return fold_(other.names.canonical) === folded && fold_(other.names.qualifier) === qualifier;
  });
}

/** Records of `kinds` sharing any folded name with `record` (canonical, display, IUPAC, aliases). */
function namePeers(record: AnyRecord, ctx: RuleContext, kinds: readonly RecordKind[]): RecordRef[] {
  return foldedNamesOf(record).flatMap((name) => kinds.flatMap((kind) => ctx.indexes.byFoldedName(kind, name)));
}

const speciesReferrersOf = (ids: readonly string[], ctx: RuleContext): RecordRef[] =>
  ids.flatMap((id) =>
    ctx.indexes
      .referrersOf(id)
      .filter((r) => r.owner.kind === 'species' && r.path.startsWith('classIds'))
      .map((r) => r.owner),
  );

/** Direct parents of a hierarchy record and everything above them. */
function ancestorsThroughParents(kind: HierarchyKind, record: AnyRecord, ctx: RuleContext): string[] {
  return parentIdsOf(record, kind).flatMap((parent) => [parent, ...ctx.indexes.ancestorsOf(kind, parent)]);
}

const HIERARCHIES: readonly ('class' | 'concept' | 'named_reaction' | 'topic')[] = ['class', 'concept', 'named_reaction', 'topic'];

/** Component reagents referenced by a reagent, in order. */
const componentReagents = (record: AnyRecord): string[] =>
  record.kind === 'reagent' ? record.components.flatMap((c) => (c.ref.kind === 'reagent' ? [c.ref.id] : [])) : [];

/** True if `start` reaches itself through reagent components; `truncated` if the walk hit its bound. */
function reagentCycle(start: AnyRecord, ctx: RuleContext): { readonly cyclic: boolean; readonly truncated: boolean } {
  let visited = 0;
  let cyclic = false;
  const componentsOf = (id: string): string[] => {
    const record = id === start.id ? start : ctx.indexes.get(id);
    return record === undefined ? [] : componentReagents(record);
  };
  closure(start.id, (id) => {
    visited += 1;
    if (visited > MAX_WALK_NODES) return [];
    const next = componentsOf(id);
    if (next.includes(start.id)) cyclic = true;
    return next;
  });
  return { cyclic, truncated: visited > MAX_WALK_NODES };
}

export const SUBSTANCE_RULES: readonly ValidationRule[] = [
  rule({
    id: 'SPC-001',
    level: 3,
    kinds: ['species'],
    defaultSeverity: 'warning',
    scope: 'global',
    // compares names with name twins found by the name index: `peers`
    referencedReads: NO_REFERENCED_READS,
    description: 'Two species share a folded canonical name without distinguishing qualifiers',
    peers: (record, ctx) => namePeers(record, ctx, ['species']),
    *check(species, ctx) {
      const twins = twinsOf(species, ctx, 'species');
      if (twins.length === 0) return;
      yield {
        path: 'names.canonical',
        message: `${twins.length} other species share the name "${species.names.canonical}". Add a qualifier to tell them apart.`,
        related: asRefs(twins),
        data: { count: twins.length },
      };
    },
  }),

  rule({
    id: 'SPC-002',
    level: 3,
    kinds: ['species'],
    defaultSeverity: 'warning',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: 'speciesKind ion with zero or absent charge',
    *check(species) {
      if (species.speciesKind !== 'ion' || (species.charge !== undefined && species.charge !== 0)) return;
      yield { path: 'charge', message: 'This species is an ion, but its charge is missing or zero.' };
    },
  }),

  rule({
    id: 'SPC-003',
    level: 3,
    kinds: ['species'],
    defaultSeverity: 'warning',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: 'single_stereoisomer without descriptors',
    *check(species) {
      if (species.stereo?.kind !== 'single_stereoisomer' || species.stereo.descriptors.length > 0) return;
      yield { path: 'stereo.descriptors', message: 'This species is a single stereoisomer, but no descriptors (such as 2R or E) say which.' };
    },
  }),

  rule({
    id: 'SPC-004',
    level: 3,
    kinds: ['species'],
    defaultSeverity: 'info',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: 'Species with neither structure nor formula',
    *check(species) {
      if (species.structure !== undefined || species.formula !== undefined) return;
      yield { path: 'structure', message: 'This species has neither a structure nor a formula.' };
    },
  }),

  rule({
    id: 'SPC-005',
    level: 3,
    kinds: ['species'],
    watches: ['class'],
    defaultSeverity: 'info',
    scope: 'global',
    // compares names with classes found by the name index: `watches` + `peers`
    referencedReads: NO_REFERENCED_READS,
    description: 'Species name equals a class name (possible hub-as-species confusion)',
    peers: (record, ctx) => (record.kind === 'class' ? namePeers(record, ctx, ['species']) : []),
    *check(species, ctx) {
      const folded = fold_(species.names.canonical);
      const classes = existing(ctx, ctx.indexes.byFoldedName('class', folded)).filter(
        (c) => c.kind === 'class' && fold_(c.names.canonical) === folded,
      );
      if (classes.length === 0) return;
      yield {
        path: 'names.canonical',
        message: `A class has the same name as this species ("${species.names.canonical}"). Check that a class is not being used as a species.`,
        related: asRefs(classes),
      };
    },
  }),

  rule({
    id: 'SPC-006',
    level: 3,
    kinds: ['species'],
    watches: ['class'],
    defaultSeverity: 'info',
    scope: 'neighbourhood',
    description: 'classIds lists both a class and its ancestor',
    peers: (record, ctx) =>
      record.kind === 'class' ? speciesReferrersOf([record.id, ...ctx.indexes.descendantsOf('class', record.id)], ctx) : [],
    *check(species, ctx) {
      const listed = new Set<string>(species.classIds);
      for (const [i, id] of species.classIds.entries()) {
        const above = ctx.indexes.ancestorsOf('class', id).filter((ancestor) => listed.has(ancestor));
        if (above.length === 0) continue;
        yield {
          path: at('classIds', i),
          message: `This species lists both a class and ${above.length === 1 ? 'its ancestor' : 'its ancestors'}; the more general class is implied.`,
          related: above.slice(0, MAX_RELATED).map((ancestor) => ({ kind: 'class', id: ancestor })),
        };
      }
    },
  }),

  rule({
    id: 'SPC-007',
    level: 3,
    kinds: ['species'],
    defaultSeverity: 'error',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: "Property key 'other' without a label",
    *check(species) {
      for (const [i, property] of species.properties.entries()) {
        if (property.key !== 'other' || property.label !== undefined) continue;
        yield { path: at('properties', i, 'label'), message: `Property ${i + 1} has the key "other", so it needs a label saying what it is.` };
      }
    },
  }),

  rule({
    id: 'CLS-001',
    level: 3,
    kinds: ['class'],
    defaultSeverity: 'warning',
    scope: 'neighbourhood',
    // reads which classes each example species lists; descendants come through `peers`
    referencedReads: { species: ['classIds'] },
    description: 'Example species does not list the class (or a descendant)',
    peers: (record, ctx) => ancestorsThroughParents('class', record, ctx).map((id): RecordRef => ({ kind: 'class', id })),
    *check(cls, ctx) {
      const accepted = new Set<string>([cls.id, ...ctx.indexes.descendantsOf('class', cls.id)]);
      for (const [i, id] of cls.exampleSpeciesIds.entries()) {
        const species = ctx.indexes.get(id);
        if (species === undefined || species.kind !== 'species') continue; // dangling: REF-001
        if (species.classIds.some((c) => accepted.has(c))) continue;
        yield { path: at('exampleSpeciesIds', i), message: `This example species does not list this class or any class below it.`, related: [asRef(species)] };
      }
    },
  }),

  rule({
    id: 'CLS-002',
    level: 3,
    kinds: ['class'],
    defaultSeverity: 'warning',
    scope: 'global',
    // compares names with name twins found by the name index: `peers`
    referencedReads: NO_REFERENCED_READS,
    description: 'Two classes share a folded canonical name',
    peers: (record, ctx) => namePeers(record, ctx, ['class']),
    *check(cls, ctx) {
      const twins = twinsOf(cls, ctx, 'class');
      if (twins.length === 0) return;
      yield {
        path: 'names.canonical',
        message: `${twins.length} other class${twins.length === 1 ? '' : 'es'} share the name "${cls.names.canonical}". Add a qualifier to tell them apart.`,
        related: asRefs(twins),
        data: { count: twins.length },
      };
    },
  }),

  rule({
    id: 'RGT-001',
    level: 3,
    kinds: ['reagent'],
    defaultSeverity: 'warning',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: 'Reagent has both speciesId and components',
    *check(reagent) {
      if (reagent.speciesId === undefined || reagent.components.length === 0) return;
      yield { path: 'speciesId', message: 'This reagent is both a single species and a mixture of components. Use one or the other.' };
    },
  }),

  rule({
    id: 'RGT-002',
    level: 3,
    kinds: ['reagent'],
    defaultSeverity: 'warning',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: 'Duplicate profile labels within one reagent',
    *check(reagent) {
      const seen = new Map<string, number>();
      for (const [i, profile] of reagent.profiles.entries()) {
        const key = fold_(profile.label);
        const earlier = seen.get(key);
        if (earlier === undefined) {
          seen.set(key, i);
          continue;
        }
        yield { path: at('profiles', i, 'label'), message: `Profile ${i + 1} has the same label as profile ${earlier + 1}.` };
      }
    },
  }),

  rule({
    id: 'HIER-001',
    level: 3,
    kinds: HIERARCHIES,
    defaultSeverity: 'error',
    scope: 'global',
    description: 'Cycle in class, concept or named-reaction parents, or in the topic tree',
    peers: (record, ctx) => {
      const kind = record.kind as HierarchyKind;
      return [
        ...ctx.indexes.descendantsOf(kind, record.id),
        ...ctx.indexes.ancestorsOf(kind, record.id),
        ...ancestorsThroughParents(kind, record, ctx),
      ].map((id): RecordRef => ({ kind, id }));
    },
    *check(record, ctx) {
      const kind = record.kind as HierarchyKind;
      for (const [i, parent] of parentIdsOf(record, kind).entries()) {
        const cyclic = parent === record.id || ctx.indexes.ancestorsOf(kind, parent).includes(record.id);
        if (!cyclic) continue;
        yield {
          path: kind === 'topic' ? 'parentId' : at('parentIds', i),
          message: parent === record.id ? 'This record is its own parent.' : 'This parent link closes a cycle: the parent is already below this record.',
          related: [{ kind, id: parent }],
        };
      }
    },
  }),

  rule({
    id: 'HIER-002',
    level: 3,
    kinds: ['topic'],
    defaultSeverity: 'warning',
    scope: 'neighbourhood',
    // reads the parent topic's kind
    referencedReads: { topic: ['topicKind'] },
    description: 'Topic parent has a lower-level topic kind than the child',
    *check(topic, ctx) {
      if (topic.parentId === undefined) return;
      const parent = ctx.indexes.get(topic.parentId);
      if (parent === undefined || parent.kind !== 'topic') return;
      if (TOPIC_KINDS.indexOf(parent.topicKind) <= TOPIC_KINDS.indexOf(topic.topicKind)) return;
      yield {
        path: 'parentId',
        message: `A ${topic.topicKind} sits under a ${parent.topicKind}, which is finer-grained than it is.`,
        related: [asRef(parent)],
      };
    },
  }),

  rule({
    id: 'HIER-003',
    level: 3,
    kinds: ['reagent'],
    defaultSeverity: 'error',
    scope: 'global',
    description: 'Cycle in reagent composition',
    peers: (record, ctx) => {
      const upstream = closure(record.id, (id) =>
        ctx.indexes
          .referrersOf(id)
          .filter((r) => r.owner.kind === 'reagent' && r.path.startsWith('components'))
          .map((r) => r.owner.id),
      );
      return upstream.length > MAX_WALK_NODES ? allOfKinds(ctx, ['reagent']) : upstream.map((id): RecordRef => ({ kind: 'reagent', id }));
    },
    *check(reagent, ctx) {
      const { cyclic, truncated } = reagentCycle(reagent, ctx);
      if (!cyclic) return;
      const via = reagent.components.findIndex((c) => c.ref.kind === 'reagent');
      yield {
        path: via === -1 ? 'components' : at('components', via, 'ref'),
        message: `This reagent is built, directly or through other reagents, from itself${truncated ? ' (the check stopped early on a very large composition)' : ''}.`,
      };
    },
  }),
];
