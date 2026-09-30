/**
 * Step 3.11a, INV-23 for the reaction side: every leaf under `reactions[]` of the v5 data is (a) consumed by a mapping, (b) found in
 * the `provenance.legacy.unmapped` of its reaction, or (c) returned in `deferred` - and `deferred` holds ONLY the fields step 3.11b
 * maps. The leaves are enumerated by a walker in THIS file, never from the mapper's trace; the trace is checked against the
 * output by reading each consumed value back out of the records. The checker itself is tested against a trace with a hole.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Asset, Reaction, Species } from '@/core/schema';
import { legacyFixture, legacyTestFixture } from '@/test-support/legacy-kit';
import { mapAll, type MappedAll } from '@/test-support/legacy-reaction-kit';
import type { HubDecision } from './compound-map';

/** The 3.11b field names, typed out from docs/IMPLEMENTATION_PLAN.md §2 (row 3.11b). */
const PLAN_3_11B = ['transformation', 'mechanism', 'reactionType', 'reactionFamily', 'reagentFamily', 'namedReaction', 'chapter', 'jee', 'relatedReactions', 'collapseIntermediates', '_v4'];

type Scalar = string | number | boolean | null;
interface Leaf {
  readonly path: string;
  readonly index: number;
  readonly field: string;
  readonly sub: readonly (string | number)[];
  readonly value: Scalar;
}

const spell = (segments: readonly (string | number)[]): string =>
  segments.reduce<string>((text, s) => (typeof s === 'number' ? `${text}[${s}]` : /^[A-Za-z_$][\w$]*$/.test(s) ? `${text}${text ? '.' : ''}${s}` : `${text}[${JSON.stringify(s)}]`), '');

/** Every scalar leaf under `reactions[]`, walked here (iteratively; empty arrays and objects hold none). */
function reactionLeaves(reactions: readonly unknown[]): Leaf[] {
  const out: Leaf[] = [];
  reactions.forEach((reaction, index) => {
    const stack: { path: (string | number)[]; value: unknown }[] = [{ path: [], value: reaction }];
    while (stack.length > 0) {
      const { path, value } = stack.pop() as { path: (string | number)[]; value: unknown };
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
        if (path.length > 0) out.push({ path: spell(['reactions', index, ...path]), index, field: String(path[0]), sub: path.slice(1), value: value as Scalar });
      } else if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i -= 1) stack.push({ path: [...path, i], value: value[i] });
      } else if (typeof value === 'object') {
        const keys = Object.keys(value);
        for (let i = keys.length - 1; i >= 0; i -= 1) stack.push({ path: [...path, keys[i] as string], value: (value as Record<string, unknown>)[keys[i] as string] });
      }
    }
  });
  return out;
}

function scalarsOf(value: unknown): Scalar[] {
  const out: Scalar[] = [];
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) out.push(item as Scalar);
    else if (Array.isArray(item)) stack.push(...item);
    else if (typeof item === 'object' && item !== undefined) stack.push(...Object.values(item));
  }
  return out;
}

function unaccounted(run: MappedAll, consumed: ReadonlySet<string>): string[] {
  const deferred = new Set(run.reactions.deferred);
  const pools = new Map<number, Scalar[]>();
  const pool = (index: number): Scalar[] => {
    let scalars = pools.get(index);
    if (scalars === undefined) {
      scalars = scalarsOf((run.reactions.records.reaction[index] as Reaction).provenance.legacy?.unmapped);
      pools.set(index, scalars);
    }
    return scalars;
  };
  const missing: string[] = [];
  for (const leaf of reactionLeaves(run.data.reactions)) {
    if (consumed.has(leaf.path) || deferred.has(leaf.path)) continue;
    const scalars = pool(leaf.index);
    const at = scalars.findIndex((candidate) => candidate === leaf.value);
    if (at < 0) missing.push(`${leaf.path} = ${JSON.stringify(leaf.value)}`);
    else scalars.splice(at, 1); // a kept value covers ONE leaf
  }
  return missing;
}

const hostile = {
  schemaVersion: 5,
  compounds: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B', nodeType: 'major' }],
  reactions: [
    { id: 'r1', name: 5, participants: [{ ref: 'c1', role: 'substrate', note: 'bad\u0001', image: {} }, { ref: 99, role: 'product', major: true }, { ref: { a: 1 }, label: ['x'], role: 'reagent' }, { label: 'dry\u0000', role: 'reagent' }, { ref: '', label: '', role: 'reagent', note: 'stray', image: 'data:image/png;base64,' }], conditions: { text: 'x'.repeat(3_000), temperature: [1], heat: 'yes', zz: { y: null } }, tags: 'a,b', image: 5, customThing: [1, { b: null }], 'odd key': { '[0]': 1 } },
    { id: 'r1', name: 'Repeated', participants: [{ ref: 'c2', role: 'toString', major: true, note: 'n' }, { ref: '', label: '443 K', role: 'workup', note: 'temperature note' }], conditions: { text: '  ', pressure: '2 atm' }, jee: { traps: ['t'] } },
    { name: 'no id', participants: [] },
  ],
};

const inputs: [string, () => unknown][] = [
  ['v6-demo-export.json', () => legacyFixture('v6-demo-export.json')],
  ['v4-sample.json', () => legacyFixture('v4-sample.json')],
  ['the quirk workbook', () => legacyTestFixture('quirks.json')],
  ['a hostile document', () => hostile],
];

describe('every leaf under reactions[] is consumed, kept in unmapped, or deferred (INV-23)', () => {
  it.each(inputs)('%s: nothing is unaccounted for', async (_name, load) => {
    const run = await mapAll(load());
    expect(unaccounted(run, run.reactions.consumed)).toEqual([]);
  });

  it.each(inputs)('%s: with every hub decided as species the same holds', async (_name, load) => {
    const hubs = new Map<string, HubDecision>(((load() as { compounds: { id: string; nodeType?: string }[] }).compounds ?? []).flatMap((c) => (c.nodeType === 'major' ? [[c.id, 'species' as const] as [string, HubDecision]] : [])));
    const run = await mapAll(load(), {}, hubs);
    expect(unaccounted(run, run.reactions.consumed)).toEqual([]);
  });

  it('the checker is real: a trace with a hole is caught', async () => {
    const run = await mapAll(legacyFixture('v6-demo-export.json'));
    const without = new Set(run.reactions.consumed);
    without.delete('reactions[0].participants[0].role');
    without.delete('reactions[3].conditions.text');
    expect(unaccounted(run, without)).toEqual(['reactions[0].participants[0].role = "substrate"', 'reactions[3].conditions.text = ""']);
    expect(unaccounted(run, run.reactions.consumed)).toEqual([]);
  });

  it.each(inputs)('%s: deferred holds ONLY the 3.11b fields, all of them, and nothing deferred is also consumed', async (_name, load) => {
    const run = await mapAll(load());
    const leaves = reactionLeaves(run.data.reactions);
    const deferred = new Set(run.reactions.deferred);
    const expected = leaves.filter((leaf) => PLAN_3_11B.includes(leaf.field)).map((leaf) => leaf.path);
    expect([...deferred].sort()).toEqual([...expected].sort());
    for (const path of deferred) expect(run.reactions.consumed.has(path), path).toBe(false);
  });

  it.each(inputs)('%s: unmapped values are leaves of the reaction they came from (nothing invented)', async (_name, load) => {
    const run = await mapAll(load());
    run.reactions.records.reaction.forEach((reaction, index) => {
      const unmapped = structuredClone(reaction.provenance.legacy?.unmapped ?? {}) as Record<string, unknown>;
      const conditions = unmapped.conditions as Record<string, unknown> | undefined;
      if (conditions !== undefined) delete conditions.overflowOther; // derived entries, not leaves
      const legacy = reactionLeaves([run.data.reactions[index]]).map((leaf) => leaf.value);
      const pool = [...legacy];
      for (const scalar of scalarsOf(unmapped)) {
        const at = pool.findIndex((candidate) => candidate === scalar);
        expect(at, `${reaction.id}: ${JSON.stringify(scalar)}`).toBeGreaterThanOrEqual(0);
        pool.splice(at, 1);
      }
    });
  });
});

const sha = (dataUrl: string): string => createHash('sha256').update(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')).digest('hex');

describe('the trace is read back against the records', () => {
  function readBack(run: MappedAll): string[] {
    const wrong: string[] = [];
    const reactions = run.reactions.records.reaction;
    const assets = new Map(((run.merged.records.asset ?? []) as Asset[]).map((a) => [a.id as string, a] as const));
    const legacyOf = new Map<string, string>([...run.compounds.refByLegacyId].map(([legacy, ref]) => [legacy, ref.id as string]));
    for (const species of run.reactions.records.species) if (species.provenance.legacy?.legacyId !== undefined) legacyOf.set(species.provenance.legacy.legacyId, species.id);
    for (const leaf of reactionLeaves(run.data.reactions)) {
      if (!run.reactions.consumed.has(leaf.path)) continue;
      const reaction = reactions[leaf.index] as Reaction;
      const part = reaction.id.slice('rxn_v6-'.length);
      const nested = (kind: 'prt' | 'pdt' | 'int', position: number): string => `${kind}_v6-${part}-${position}`;
      const position = typeof leaf.sub[1] === 'number' ? leaf.sub[1] + 1 : 0;
      const products = reaction.outcomes.flatMap((o) => o.products);
      const item = leaf.field === 'participants'
        ? (reaction.participants.find((p) => p.id === nested('prt', position)) ?? products.find((p) => p.id === nested('pdt', position)) ?? reaction.intermediates.find((i) => i.id === nested('int', position)))
        : undefined;
      const key = String(leaf.sub[2] ?? '');
      const fail = (why: string): void => void wrong.push(`${leaf.path} = ${JSON.stringify(leaf.value)}: ${why}`);
      if (leaf.field === 'id' && typeof leaf.value === 'string' && reaction.provenance.legacy?.legacyId !== leaf.value) fail('legacyId differs');
      if (leaf.field === 'name' && leaf.value !== reaction.name) fail('name differs');
      if (leaf.field === 'tags' && !reaction.tags.includes(leaf.value as string)) fail('tag missing');
      if (leaf.field === 'conditions' && leaf.sub[0] === 'text' && typeof leaf.value === 'string' && leaf.value.trim() !== '' && (reaction.stages[0]?.parameters.text !== leaf.value || reaction.stages[0]?.originalText !== leaf.value)) fail('conditions.text not in stage 1');
      if (leaf.field === 'participants' && typeof leaf.value === 'string' && leaf.value !== '') {
        if (key === 'note' && (item === undefined || (item as { note?: string }).note !== leaf.value)) fail('note not on the participant');
        if (key === 'ref' && (item === undefined || (item as { ref?: { id: string } }).ref?.id !== legacyOf.get(leaf.value))) fail('ref does not resolve to the record of that legacy id');
        if (key === 'label' && item !== undefined && (item as { originalText?: string }).originalText !== leaf.value && (item as { label?: string }).label !== leaf.value) fail('label is neither originalText nor the intermediate label');
        if (key === 'label' && item === undefined) {
          const stageParams = reaction.stages.map((s) => s.parameters);
          if (!stageParams.some((p) => p.temperature !== undefined || p.light !== undefined || p.other.length > 0)) fail('label consumed as a stage parameter but no stage has one');
        }
        if (key === 'image' && !(assets.get(`ast_v6-${sha(leaf.value).slice(0, 16)}`)?.attachedTo ?? []).some((t) => t.ref.id === reaction.id)) fail('no asset attached to the reaction');
      }
      if (leaf.field === 'image' && typeof leaf.value === 'string' && leaf.value !== '' && !(assets.get(`ast_v6-${sha(leaf.value).slice(0, 16)}`)?.attachedTo ?? []).some((t) => t.ref.id === reaction.id)) fail('no asset attached to the reaction');
    }
    return wrong;
  }

  it.each(inputs)('%s: each consumed value is really in the output', async (_name, load) => {
    expect(readBack(await mapAll(load()))).toEqual([]);
  });

  it('the read-back is real: a false claim is caught', async () => {
    const run = await mapAll(legacyFixture('v6-demo-export.json'));
    const lie = { ...run, reactions: { ...run.reactions, consumed: new Set([...run.reactions.consumed, 'reactions[0].name']) }, data: { ...run.data, reactions: run.data.reactions.map((r, i) => (i === 0 ? { ...r, name: 'Not the name' } : r)) } } as MappedAll;
    expect(readBack(lie)).toEqual(['reactions[0].name = "Not the name": name differs']);
    const species: Species | undefined = run.reactions.records.species[0];
    expect(species).toBeDefined();
  });
});
