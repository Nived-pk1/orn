/**
 * fast-check model for command sequences (docs/TEST_STRATEGY.md §4). A sequence is abstract data:
 * intents made of an operation and three integers. `resolveIntent` turns an intent into a concrete
 * command against the CURRENT state (targets are picked by index modulo the live records), so every
 * command is schema-valid by construction and failures shrink to short sequences of small numbers.
 * Test-only.
 */
import fc from 'fast-check';
import { duplicateRecord, mergeRecords, reorderItems } from '@/core/commands';
import type { CommandContext, CommandEnvelope } from '@/core/commands';
import { documentToState } from '@/core/dataset';
import type { AnyRecord, CanonicalState, RecordKind, RecordRef } from '@/core/schema';
import { GENERATOR_SHAPES, generateDataset, type GeneratorParams } from './generator';

export const INTENT_OPS = [
  'rename',
  'edit_note',
  'create_species',
  'create_reaction',
  'duplicate',
  'merge_species',
  'reorder_participants',
  'delete_cascade',
  'delete_restrict',
  'retitle',
] as const;
export type IntentOp = (typeof INTENT_OPS)[number];

export interface Intent {
  readonly op: IntentOp;
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

const int = fc.integer({ min: 0, max: 1_000_000 });

export const intentArb: fc.Arbitrary<Intent> = fc.record({ op: fc.constantFrom(...INTENT_OPS), a: int, b: int, c: int });

export const intentsArb = (maxLength = 40): fc.Arbitrary<Intent[]> => fc.array(intentArb, { minLength: 1, maxLength });

/** Kinds that the model edits, duplicates and deletes. */
const EDITABLE: readonly RecordKind[] = ['species', 'class', 'reagent', 'reaction', 'concept', 'topic'];
/** Where each kind keeps its display name (a data table, not a per-record rule). */
const NAME_FIELD: Readonly<Partial<Record<RecordKind, 'names' | 'name'>>> = {
  species: 'names',
  class: 'names',
  reagent: 'names',
  reaction: 'name',
  concept: 'name',
  topic: 'name',
};

const pick = <T>(items: readonly T[], n: number): T | undefined => (items.length === 0 ? undefined : items[n % items.length]);
const idsOf = (state: CanonicalState, kind: RecordKind): string[] => Object.keys(state.records[kind]).sort();
const at = (state: CanonicalState, kind: RecordKind, id: string): AnyRecord =>
  (state.records[kind] as Readonly<Record<string, AnyRecord>>)[id] as AnyRecord;

/** Any existing record of one of the editable kinds, chosen by index. */
export function pickRecord(state: CanonicalState, a: number, b: number): RecordRef | undefined {
  const kind = pick(EDITABLE.filter((k) => idsOf(state, k).length > 0), a);
  if (kind === undefined) return undefined;
  const id = pick(idsOf(state, kind), b);
  return id === undefined ? undefined : ({ kind, id } as RecordRef);
}

/** The record with its display name replaced, or undefined for kinds without a name field. */
export function renamed(record: AnyRecord, name: string): AnyRecord | undefined {
  const field = NAME_FIELD[record.kind];
  if (field === 'names') return { ...record, names: { ...(record as unknown as { names: object }).names, canonical: name } } as AnyRecord;
  if (field === 'name') return { ...record, name } as AnyRecord;
  return undefined;
}

const env = (label: string, ...commands: CommandEnvelope['commands'][number][]): CommandEnvelope => ({ label, commands });

function createSpecies(state: CanonicalState, ctx: CommandContext, n: number): CommandEnvelope | undefined {
  const classId = pick(idsOf(state, 'class'), n);
  if (classId === undefined) return undefined;
  const now = ctx.now();
  const record = {
    id: ctx.newId('spc'), kind: 'species', names: { canonical: `Model species ${n}`, common: [], aliases: [] },
    speciesKind: 'molecule', classIds: [classId], properties: [], tags: [], citations: [],
    provenance: { origin: 'generated', createdAt: now, updatedAt: now },
    review: { lifecycle: 'published', status: 'unreviewed', reasons: [] },
  } as unknown as AnyRecord;
  return env('Create species', { type: 'record.create', record });
}

function createReaction(state: CanonicalState, ctx: CommandContext, i: Intent): CommandEnvelope | undefined {
  const species = idsOf(state, 'species');
  if (species.length < 2) return undefined;
  const from = pick(species, i.a) as string;
  const to = pick(species.filter((s) => s !== from), i.b) as string;
  const reagent = pick(idsOf(state, 'reagent'), i.c);
  const now = ctx.now();
  const participants: unknown[] = [
    { id: ctx.newId('prt'), ref: { kind: 'species', id: from }, role: 'reactant', isPrimarySubstrate: true },
  ];
  if (reagent !== undefined) participants.push({ id: ctx.newId('prt'), ref: { kind: 'reagent', id: reagent }, role: 'reagent' });
  const record = {
    id: ctx.newId('rxn'), kind: 'reaction', name: `Model reaction ${i.a}`, aliases: [], scope: 'specific',
    purposes: ['synthesis'], namedReactionIds: [], transformationIds: [], reactionTypes: [], mechanismClasses: [],
    participants, stages: [], conditionVariants: [],
    outcomes: [{
      id: ctx.newId('out'), conditionVariantIds: [], selectivity: 'exclusive', conceptIds: [],
      products: [{ id: ctx.newId('pdt'), ref: { kind: 'species', id: to }, role: 'main' }],
    }],
    intermediates: [], mechanismIds: [], reversibility: { kind: 'irreversible' }, conceptIds: [],
    prerequisiteConceptIds: [], difficulty: 1, tags: [], citations: [],
    provenance: { origin: 'generated', createdAt: now, updatedAt: now },
    review: { lifecycle: 'published', status: 'unreviewed', reasons: [] },
  } as unknown as AnyRecord;
  return env('Create reaction', { type: 'record.create', record });
}

/**
 * The concrete envelope for an intent, or undefined when the current state has nothing to apply it to.
 * The result is valid against the schema; the store may still reject it if it breaks an L2/L3 ERROR rule
 * (for instance deleting the only product of a published reaction), which is part of what is tested.
 */
export function resolveIntent(state: CanonicalState, intent: Intent, ctx: CommandContext): CommandEnvelope | undefined {
  switch (intent.op) {
    case 'rename': {
      const target = pickRecord(state, intent.a, intent.b);
      const next = target === undefined ? undefined : renamed(at(state, target.kind, target.id), `Renamed ${intent.c}`);
      return next === undefined ? undefined : env(`Rename ${next.id}`, { type: 'record.update', record: next });
    }
    case 'edit_note': {
      const target = pickRecord(state, intent.a, intent.b);
      if (target === undefined) return undefined;
      const record = { ...at(state, target.kind, target.id), notes: `note ${intent.c}` } as unknown as AnyRecord;
      return env(`Note ${target.id}`, { type: 'record.update', record });
    }
    case 'create_species':
      return createSpecies(state, ctx, intent.a);
    case 'create_reaction':
      return createReaction(state, ctx, intent);
    case 'duplicate': {
      const target = pickRecord(state, intent.a, intent.b);
      if (target === undefined) return undefined;
      const built = duplicateRecord(state, target, ctx);
      return built.ok ? built.envelope : undefined;
    }
    case 'merge_species': {
      const species = idsOf(state, 'species');
      const source = pick(species, intent.a);
      const target = pick(species.filter((s) => s !== source), intent.b);
      if (source === undefined || target === undefined) return undefined;
      const built = mergeRecords(state, { kind: 'species', id: source }, { kind: 'species', id: target });
      return built.ok ? built.envelope : undefined;
    }
    case 'reorder_participants': {
      const id = pick(idsOf(state, 'reaction'), intent.a);
      if (id === undefined) return undefined;
      const order = (at(state, 'reaction', id) as unknown as { participants: { id: string }[] }).participants.map((p) => p.id);
      // Deterministic permutation: rotate by an amount taken from the intent.
      const shift = order.length === 0 ? 0 : intent.b % order.length;
      const built = reorderItems(state, {
        ref: { kind: 'reaction', id }, field: 'participants', orderedIds: [...order.slice(shift), ...order.slice(0, shift)],
      });
      return built.ok ? built.envelope : undefined;
    }
    case 'delete_cascade':
    case 'delete_restrict': {
      const target = pickRecord(state, intent.a, intent.b);
      if (target === undefined) return undefined;
      const mode = intent.op === 'delete_cascade' ? 'apply_cascade' : 'restrict';
      return env(`Delete ${target.id}`, { type: 'record.delete', ref: target, mode });
    }
    case 'retitle':
      return env('Retitle dataset', { type: 'meta.update', meta: { ...state.meta, title: `Dataset ${intent.a}` } });
  }
}

/** Small generated datasets for property tests, as frozen canonical states. */
export const smallParamsArb: fc.Arbitrary<GeneratorParams> = fc.record({
  species: fc.integer({ min: 8, max: 24 }),
  classes: fc.integer({ min: 2, max: 5 }),
  reagents: fc.integer({ min: 1, max: 5 }),
  reactions: fc.integer({ min: 2, max: 20 }),
  relationshipsPerReaction: fc.constantFrom(0, 0.5, 1),
  topics: fc.integer({ min: 1, max: 4 }),
  shape: fc.constantFrom(...GENERATOR_SHAPES),
  seed: fc.integer({ min: 1, max: 1_000_000 }),
});

export function frozenStateOf(params: GeneratorParams): CanonicalState {
  const parsed = documentToState(generateDataset(params));
  if (!parsed.ok) throw new Error('generator produced duplicate IDs');
  return parsed.state;
}
