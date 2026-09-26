import { describe, expect, it } from 'vitest';
import { RECORD_KINDS, type AnyRecord, type CanonicalState, type RecordKind } from '../schema';
import { referenceEngine } from '../references';
import type { Referrer } from '../references/contracts';
import { fold } from '../text';
import { commit, loadFixtureState, must, type Tables } from '../../test-support/state-fixture';
import { coreIndexEngine } from './engine';
import { foldedNamesOf } from './names';

const base = loadFixtureState('maximal-valid');
const all = (state: CanonicalState): AnyRecord[] =>
  RECORD_KINDS.flatMap((kind) => Object.values(state.records[kind] as Record<string, AnyRecord>));

/** Independent oracle: every reference of every record, grouped by target and sorted. */
function expectedReferrers(state: CanonicalState): Map<string, Referrer[]> {
  const out = new Map<string, Referrer[]>();
  for (const record of all(state)) {
    for (const ref of referenceEngine.extract(record)) {
      const list = out.get(ref.targetId) ?? [];
      list.push({
        owner: { kind: record.kind, id: record.id },
        path: ref.path,
        targetId: ref.targetId,
        onDelete: ref.spec.onDelete,
      });
      out.set(ref.targetId, list);
    }
  }
  for (const list of out.values()) list.sort((a, b) => (a.owner.id + a.path < b.owner.id + b.path ? -1 : 1));
  return out;
}

describe('build: reverse references', () => {
  const ix = coreIndexEngine.build(base);

  it('matches an independent walk of every record, for record and nested IDs', () => {
    const expected = expectedReferrers(base);
    expect(expected.size).toBeGreaterThan(40);
    for (const [target, referrers] of expected) expect(ix.referrersOf(target), target).toEqual(referrers);
  });

  it('includes nested-ID targets (participants) and carries the registry delete policy', () => {
    const reaction = must(
      Object.values(base.records.reaction).find((r) => r.participants.some((p) => ix.referrersOf(p.id).length > 0)),
    );
    const referrers = reaction.participants.flatMap((p) => ix.referrersOf(p.id));
    expect(referrers.length).toBeGreaterThan(0);
    expect(referrers.every((ref) => ref.path.length > 0)).toBe(true);
    expect(referrers.some((ref) => ref.owner.id === reaction.id)).toBe(true);
    const speciesRef = must(reaction.participants.find((p) => p.ref.kind === 'species')).ref;
    const viaParticipant = ix.referrersOf(speciesRef.id).find((ref) => ref.owner.id === reaction.id);
    expect(viaParticipant?.onDelete).toBe('restrict');
  });

  it('lists nothing for unknown and malformed IDs', () => {
    expect(ix.referrersOf('spc_nothing')).toEqual([]);
    expect(ix.referrersOf('')).toEqual([]);
    expect(ix.referrersOf('__proto__')).toEqual([]);
    expect(ix.referrersOf('constructor')).toEqual([]);
  });

  it('orders referrers by owner ID then path regardless of insertion order', () => {
    const target = must(Object.values(base.records.class)[0]);
    const species = must(Object.values(base.records.species)[0]);
    const { after } = commit(base, 1, (tables: Tables) => {
      for (const id of ['spc_zzz', 'spc_aaa', 'spc_mmm']) {
        tables.species[id] = { ...species, id, classIds: [target.id, target.id] };
      }
    });
    const list = coreIndexEngine.build(after).referrersOf(target.id);
    const mine = list.filter((ref) => ref.owner.id.startsWith('spc_') && ['spc_aaa', 'spc_mmm', 'spc_zzz'].includes(ref.owner.id));
    expect(mine.map((ref) => `${ref.owner.id} ${ref.path}`)).toEqual([
      'spc_aaa classIds[0]',
      'spc_aaa classIds[1]',
      'spc_mmm classIds[0]',
      'spc_mmm classIds[1]',
      'spc_zzz classIds[0]',
      'spc_zzz classIds[1]',
    ]);
    expect([...list].sort((a, b) => (a.owner.id + a.path < b.owner.id + b.path ? -1 : 1))).toEqual(list);
  });
});

describe('build: get and revision', () => {
  const ix = coreIndexEngine.build(base, 7);

  it('returns every record by ID and nothing else', () => {
    for (const record of all(base)) expect(ix.get(record.id)).toBe(record);
    expect(ix.get('spc_nothing')).toBeUndefined();
    expect(ix.get('nonsense')).toBeUndefined();
    expect(ix.get('')).toBeUndefined();
  });

  it('does not treat a nested ID as a record', () => {
    const participantId = must(must(Object.values(base.records.reaction)[0]).participants[0]).id;
    expect(ix.get(participantId)).toBeUndefined();
  });

  it('carries the requested revision (default 0)', () => {
    expect(ix.revision).toBe(7);
    expect(coreIndexEngine.build(base).revision).toBe(0);
  });
});

describe('build: folded names', () => {
  const ix = coreIndexEngine.build(base);

  it('finds every record under each of its folded names, in its own kind only', () => {
    let checked = 0;
    for (const record of all(base)) {
      for (const folded of foldedNamesOf(record)) {
        expect(ix.byFoldedName(record.kind, folded), `${record.id} ${folded}`).toContainEqual({
          kind: record.kind,
          id: record.id,
        });
        const otherKind = RECORD_KINDS.find((kind) => kind !== record.kind) as RecordKind;
        expect(ix.byFoldedName(otherKind, folded).some((ref) => ref.id === record.id)).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('returns every record sharing a folded name, sorted by ID', () => {
    const species = must(Object.values(base.records.species)[0]);
    const canonical = (species as { names: { canonical: string } }).names.canonical;
    const { after } = commit(base, 1, (tables: Tables) => {
      for (const id of ['spc_dup-b', 'spc_dup-a']) {
        tables.species[id] = {
          ...species,
          id,
          names: { canonical: canonical.toUpperCase(), common: [], aliases: [], qualifier: '(other)' },
        };
      }
    });
    const found = coreIndexEngine.build(after).byFoldedName('species', fold(canonical));
    expect(found.map((ref) => ref.id)).toEqual(['spc_dup-a', 'spc_dup-b', species.id].sort());
  });

  it('is empty for unknown names and does not fold the query for the caller', () => {
    expect(ix.byFoldedName('species', 'no such species')).toEqual([]);
    expect(ix.byFoldedName('species', '')).toEqual([]);
    const species = must(Object.values(base.records.species)[0]) as { names: { canonical: string } };
    const folded = fold(species.names.canonical);
    if (folded !== species.names.canonical) expect(ix.byFoldedName('species', species.names.canonical)).toEqual([]);
  });
});

describe('foldedNamesOf', () => {
  it('collects name, names.* and aliases, folded, distinct, without the qualifier', () => {
    const record = {
      names: {
        canonical: 'Propan-2-ol',
        display: 'Propan-2-ol',
        iupac: 'propan-2-ol',
        common: ['Isopropyl alcohol', 'IPA'],
        aliases: ['2-Propanol'],
        qualifier: '(generic)',
      },
    };
    expect(foldedNamesOf(record)).toEqual([
      fold('Propan-2-ol'),
      fold('Isopropyl alcohol'),
      'ipa',
      fold('2-Propanol'),
    ]);
    expect(foldedNamesOf({ name: 'Étard reaction', aliases: ['Etard'] })).toEqual([fold('Étard reaction'), 'etard']);
  });

  it('skips empty and whitespace-only names and tolerates other shapes', () => {
    expect(foldedNamesOf({ name: '   ', aliases: ['', ' - '] })).toEqual([fold(' - ')].filter((x) => x !== ''));
    expect(foldedNamesOf({ name: 3, aliases: 5, names: 'y' })).toEqual([]);
    expect(foldedNamesOf(null)).toEqual([]);
    expect(foldedNamesOf({ title: 'Not a name field' })).toEqual([]);
  });
});
