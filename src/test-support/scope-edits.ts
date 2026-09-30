/**
 * Raw-recipe edit sets aimed at high-referrer hubs (ADR-031, step 2.12): moved out of tests/property/validation-scope.test.ts in
 * step 4.2b so the compute replica's property test (tests/property/replica.test.ts) walks the same edits. Each edit is an Immer
 * recipe, so hub deletions leave dangling references and other invalid states on purpose (the command store would refuse them;
 * incremental validation must still equal a full pass). Test-only.
 */
import { documentToState } from '@/core/dataset';
import type { CoreIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordKind } from '@/core/schema';
import { generateDataset, type GeneratorParams } from './generator';
import type { Tables } from './state-fixture';

export type Loose = Record<string, unknown>;
export type Recipe = (tables: Tables) => void;

export const ADV_012: GeneratorParams = { species: 60, classes: 3, reagents: 5, reactions: 60, relationshipsPerReaction: 0, topics: 2, shape: 'hub_explosion', seed: 7 };
export const LIKE_WATER: GeneratorParams = { species: 100, classes: 6, reagents: 8, reactions: 100, relationshipsPerReaction: 1, topics: 4, shape: 'hub_explosion', seed: 11 };

export const stateOf = (params: GeneratorParams): CanonicalState => {
  const parsed = documentToState(generateDataset(params));
  if (!parsed.ok) throw new Error('generator produced duplicate IDs');
  return parsed.state;
};

/** The class with the most referrers: the class hub every species lists in `hub_explosion`. */
export const classHubOf = (state: CanonicalState, indexes: CoreIndexes): string =>
  Object.keys(state.records.class).sort().reduce((best, id) => (indexes.referrersOf(id).length > indexes.referrersOf(best).length ? id : best));

/** The species with the most referrers: the hub, found structurally (never by ID). */
export const hubOf = (state: CanonicalState, indexes: CoreIndexes): string =>
  Object.keys(state.records.species).sort().reduce((best, id) => (indexes.referrersOf(id).length > indexes.referrersOf(best).length ? id : best));

const rec = (t: Tables, kind: RecordKind, id: string): Loose | undefined => t[kind][id] as Loose | undefined;
const list = (value: unknown): Loose[] => (Array.isArray(value) ? (value as Loose[]) : []);
const pick = <T>(items: readonly T[], n: number): T | undefined => (items.length === 0 ? undefined : items[n % items.length]);

export interface Ctx {
  readonly state: CanonicalState;
  readonly indexes: CoreIndexes;
  readonly hub: string;
  readonly classHub: string;
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly graveyard: { kind: RecordKind; record: Loose }[];
}

const ids = (state: CanonicalState, kind: RecordKind): string[] => Object.keys(state.records[kind]).sort();
/** Reactions that refer to the hub (or any reaction once the hub is gone), so edits land on referrers. */
const referrers = (x: Ctx): string[] => {
  const found = x.indexes.referrersOf(x.hub).filter((r) => r.owner.kind === 'reaction').map((r) => r.owner.id);
  return found.length > 0 ? [...new Set(found)].sort() : ids(x.state, 'reaction');
};
const reaction = (x: Ctx): string | undefined => pick(referrers(x), x.a);
const hubExists = (x: Ctx): boolean => Object.hasOwn(x.state.records.species, x.hub);

/** One edit per entry; each returns a recipe, or undefined when the current state has nothing to apply it to. */
export const EDITS: readonly ((x: Ctx) => Recipe | undefined)[] = [
  // The hub itself: name, alias, notes, lifecycle, classes, kind, deletion and restoration.
  (x) => {
    const twin = pick(ids(x.state, 'species').filter((id) => id !== x.hub), x.b);
    const other = twin === undefined ? undefined : (x.state.records.species[twin] as unknown as { names: { canonical: string } }).names.canonical;
    return (t) => { const h = rec(t, 'species', x.hub); if (h !== undefined) (h['names'] as Loose)['canonical'] = x.c % 3 === 0 && other !== undefined ? other : `Hub ${x.c}`; };
  },
  (x) => (t) => {
    const h = rec(t, 'species', x.hub);
    if (h !== undefined) (h['names'] as Loose)['aliases'] = x.c % 2 === 0 ? [] : [`alias ${x.c % 4}`, `alias ${x.b % 3}`];
  },
  (x) => {
    const target = reaction(x);
    const text = x.c % 4 === 0 ? undefined : x.c % 4 === 1 ? 'plain text' : x.c % 4 === 2 ? `See [[${target ?? 'rxn_ghost'}]] and [[spc_ghost]].` : `Also [[${x.hub}]].`;
    return (t) => { const h = rec(t, 'species', x.hub); if (h !== undefined) { if (text === undefined) delete h['notes']; else h['notes'] = text; } };
  },
  (x) => (t) => {
    const h = rec(t, 'species', x.hub);
    if (h !== undefined) Object.assign(h['review'] as Loose, { lifecycle: x.c % 2 === 0 ? 'draft' : 'published', status: x.c % 3 === 0 ? 'review_required' : 'unreviewed', reasons: x.c % 3 === 0 ? ['why'] : [] });
  },
  (x) => {
    const classes = [pick(ids(x.state, 'class'), x.a), pick(ids(x.state, 'class'), x.b)].filter((c): c is string => c !== undefined);
    return (t) => { const h = rec(t, 'species', x.hub); if (h !== undefined) h['classIds'] = x.c % 11 === 0 ? [...classes, 'cls_ghost'] : x.c % 5 === 0 ? [] : classes; };
  },
  (x) => (t) => {
    const h = rec(t, 'species', x.hub);
    if (h === undefined) return;
    h['speciesKind'] = x.c % 2 === 0 ? 'ion' : 'molecule';
    if (x.c % 2 === 0) delete h['charge']; else h['charge'] = 1;
  },
  (x) => {
    if (!hubExists(x) || x.c % 4 !== 0) return undefined; // deletions are rarer: they turn every referrer into an ERROR
    x.graveyard.push({ kind: 'species', record: x.state.records.species[x.hub] as unknown as Loose });
    return (t) => { Reflect.deleteProperty(t.species, x.hub); };
  },
  (x) => {
    const dead = pick(x.graveyard.filter((g) => rec(x.state.records as unknown as Tables, g.kind, g.record['id'] as string) === undefined), x.b);
    return dead === undefined ? undefined : (t) => { t[dead.kind][dead.record['id'] as string] = JSON.parse(JSON.stringify(dead.record)) as unknown; };
  },
  // Referrers of the hub: a field no rule reads from the hub, then fields one does.
  (x) => {
    const id = reaction(x);
    const role = pick(['reactant', 'spectator', 'catalyst', 'solvent'] as const, x.c);
    return id === undefined ? undefined : (t) => { const p = list(rec(t, 'reaction', id)?.['participants'])[0]; if (p !== undefined) { p['role'] = role; if (x.c % 2 === 0) p['flags'] = { consumed: true, contributesAtoms: true }; else delete p['flags']; } };
  },
  (x) => {
    const id = reaction(x);
    const to = x.c % 2 === 0 ? { kind: 'class', id: pick(ids(x.state, 'class'), x.b) } : { kind: 'species', id: pick(ids(x.state, 'species'), x.b) };
    return id === undefined ? undefined : (t) => { const p = list(rec(t, 'reaction', id)?.['participants'])[0]; if (p !== undefined) p['ref'] = to; };
  },
  (x) => {
    const id = reaction(x);
    const lifecycle = x.c % 2 === 0 ? 'draft' : 'published';
    return id === undefined ? undefined : (t) => { const r = rec(t, 'reaction', id); if (r !== undefined) (r['review'] as Loose)['lifecycle'] = lifecycle; };
  },
  (x) => {
    // A small pool, so that instance-of chains (an instance pointing at one that is itself an instance) form.
    const pool = ids(x.state, 'reaction').slice(0, 6);
    const id = pick(pool, x.a);
    const other = pick(pool, x.b);
    const scope = x.c % 2 === 0 ? 'generic' : 'specific';
    return id === undefined ? undefined : (t) => { const r = rec(t, 'reaction', id); if (r === undefined) return; r['scope'] = scope; if (other !== undefined && x.c % 3 !== 0) r['instanceOfId'] = other; else delete r['instanceOfId']; };
  },
  (x) => {
    const id = pick(ids(x.state, 'reaction'), x.b);
    const kind = pick(['equilibrium', 'irreversible', 'unknown'] as const, x.c);
    return id === undefined ? undefined : (t) => { const r = rec(t, 'reaction', id); if (r !== undefined) r['reversibility'] = { kind }; };
  },
  (x) => {
    const id = reaction(x);
    if (id === undefined || x.c % 3 !== 0) return undefined;
    x.graveyard.push({ kind: 'reaction', record: x.state.records.reaction[id] as unknown as Loose });
    return (t) => { Reflect.deleteProperty(t.reaction, id); };
  },
  (x) => {
    const [from, to] = [pick(ids(x.state, 'reaction'), x.a), pick(ids(x.state, 'reaction'), x.b)];
    const donor = pick(ids(x.state, 'species'), 0);
    if (from === undefined || to === undefined || donor === undefined) return undefined;
    const meta = x.state.records.species[donor] as unknown as Loose;
    const id = `rel_scope-${x.a}-${x.b}-${x.c}`;
    return (t) => {
      t.relationship[id] = {
        id, kind: 'relationship', type: 'reverse_of', reverseKind: x.c % 2 === 0 ? 'microscopic' : 'synthetic',
        from: { kind: 'reaction', id: from }, to: { kind: 'reaction', id: to },
        provenance: meta['provenance'], review: meta['review'], tags: [], citations: [],
      };
    };
  },
  (x) => {
    const id = pick(ids(x.state, 'relationship'), x.b);
    return id === undefined || x.c % 2 !== 0 ? undefined : (t) => { Reflect.deleteProperty(t.relationship, id); };
  },
  // Neighbours of the hub: a species taking its name, a class, a species linking to it, a reaction listing it twice.
  (x) => {
    const id = pick(ids(x.state, 'species').filter((s) => s !== x.hub), x.b);
    const hub = x.state.records.species[x.hub] as unknown as { names: { canonical: string } } | undefined;
    return id === undefined || hub === undefined ? undefined : (t) => { const s = rec(t, 'species', id); if (s !== undefined) (s['names'] as Loose)['canonical'] = hub.names.canonical; };
  },
  (x) => {
    const id = pick(ids(x.state, 'class'), x.b);
    return id === undefined ? undefined : (t) => { const c = rec(t, 'class', id); if (c === undefined) return; if (x.c % 2 === 0) (c['names'] as Loose)['canonical'] = `Class ${x.c % 3}`; else c['parentIds'] = [pick(ids(x.state, 'class'), x.c)].filter((p) => p !== undefined && p !== id); };
  },
  (x) => {
    const id = pick(ids(x.state, 'species').filter((s) => s !== x.hub), x.b);
    return id === undefined ? undefined : (t) => { const s = rec(t, 'species', id); if (s !== undefined) s['notes'] = `Compare [[${x.hub}]].`; };
  },
  (x) => {
    const id = reaction(x);
    return id === undefined ? undefined : (t) => { const ps = list(rec(t, 'reaction', id)?.['participants']); const first = ps[0]; if (first !== undefined) ps.push({ ...first, id: `prt_dup-${x.c}` }); };
  },
  // Review status of a referrer: RVW-001 reads the record itself, RVW-002 the lifecycle of what it refers to.
  (x) => {
    const id = reaction(x);
    const status = pick(['unreviewed', 'review_required', 'verified'] as const, x.c);
    return id === undefined ? undefined : (t) => { const r = rec(t, 'reaction', id); if (r !== undefined) Object.assign(r['review'] as Loose, { status, reasons: status === 'review_required' ? ['why'] : [] }); };
  },
  // The class hub: name (sometimes a twin's), notes, parents (may close a cycle), review, deletion.
  (x) => {
    const twin = pick(ids(x.state, 'class').filter((id) => id !== x.classHub), x.b);
    const other = twin === undefined ? undefined : (x.state.records.class[twin] as unknown as { names: { canonical: string } }).names.canonical;
    return (t) => { const c = rec(t, 'class', x.classHub); if (c !== undefined) (c['names'] as Loose)['canonical'] = x.c % 3 === 0 && other !== undefined ? other : `Class hub ${x.c}`; };
  },
  (x) => {
    const text = x.c % 3 === 0 ? undefined : x.c % 3 === 1 ? 'A plain note.' : `See [[${x.hub}]].`;
    return (t) => { const c = rec(t, 'class', x.classHub); if (c !== undefined) { if (text === undefined) delete c['notes']; else c['notes'] = text; } };
  },
  (x) => {
    const parents = [...new Set([pick(ids(x.state, 'class'), x.a), pick(ids(x.state, 'class'), x.b)].filter((p): p is string => p !== undefined && p !== x.classHub))];
    return (t) => { const c = rec(t, 'class', x.classHub); if (c !== undefined) c['parentIds'] = x.c % 4 === 0 ? [] : parents; };
  },
  (x) => (t) => {
    const c = rec(t, 'class', x.classHub);
    if (c !== undefined) Object.assign(c['review'] as Loose, { lifecycle: x.c % 2 === 0 ? 'draft' : 'published', status: x.c % 3 === 0 ? 'review_required' : 'unreviewed', reasons: x.c % 3 === 0 ? ['why'] : [] });
  },
  (x) => {
    if (!Object.hasOwn(x.state.records.class, x.classHub) || x.c % 4 !== 0) return undefined;
    x.graveyard.push({ kind: 'class', record: x.state.records.class[x.classHub] as unknown as Loose });
    return (t) => { Reflect.deleteProperty(t.class, x.classHub); };
  },
  // Species and other classes: which classes a species lists (a class and its ancestor: SPC-006), and ancestry.
  (x) => {
    const id = pick(ids(x.state, 'species'), x.a);
    const classes = [x.c % 5 === 0 ? undefined : x.classHub, pick(ids(x.state, 'class'), x.b), pick(ids(x.state, 'class'), x.c)].filter((c): c is string => c !== undefined);
    return id === undefined ? undefined : (t) => { const sp = rec(t, 'species', id); if (sp !== undefined) sp['classIds'] = [...new Set(classes)]; };
  },
  (x) => {
    const id = pick(ids(x.state, 'class').filter((c) => c !== x.classHub), x.a);
    const parent = pick(ids(x.state, 'class'), x.b);
    return id === undefined ? undefined : (t) => { const c = rec(t, 'class', id); if (c !== undefined) c['parentIds'] = parent === undefined || parent === id || x.c % 3 === 0 ? [] : [parent]; };
  },
];
