/**
 * Field-aware scope (ADR-031): what re-validates a referrer when a referenced record changes.
 * Unit tests for the change/read logic; then a high-referrer hub with rule invocations counted (a rename
 * or an alias re-runs no referrer rule; a field some rule reads does; an undeclared rule keeps the old
 * behaviour); then one read-field test per rule that declares fields, each also checked against validateAll.
 */
import { describe, expect, it } from 'vitest';
import { documentToState } from '../dataset';
import type { AnyRecord, CanonicalState, RecordKind, RecordRef } from '../schema';
import { generateDataset } from '../../test-support/generator';
import { IncrementalRun } from '../../test-support/scope-walk';
import { loadFixtureState, must, type Tables } from '../../test-support/state-fixture';
import type { ValidationRule } from './contracts';
import { RULES } from './rules/registry';
import { changeOf, readsChange, referrerFilter, rulesByKind } from './scoping';
import { createValidator } from './validator';

type Loose = Record<string, unknown>;
const rec = (t: Tables, kind: RecordKind, id: string): Loose => must(t[kind][id] as Loose | undefined, `${kind} ${id}`);
const has = (scope: readonly RecordRef[], kind: RecordKind, id: string): boolean => scope.some((r) => r.kind === kind && r.id === id);
const ruleNamed = (id: string): ValidationRule => must(RULES.find((r) => r.id === id), id);
const asRecord = (fields: Loose): AnyRecord => ({ kind: 'species', id: 'spc_x', ...fields }) as unknown as AnyRecord;

describe('changeOf', () => {
  it('is "all" without a previous state, and for a record created or deleted', () => {
    const r = asRecord({ a: 1 });
    expect(changeOf(r, r, false)).toBe('all');
    expect(changeOf(r, undefined, true)).toBe('all');
    expect(changeOf(undefined, r, true)).toBe('all');
  });

  it('names the top-level fields whose value differs, by reference', () => {
    const shared = { deep: 1 };
    const before = asRecord({ same: shared, edited: 1, gone: 2 });
    const after = asRecord({ same: shared, edited: 2, added: 3 });
    expect([...(changeOf(after, before, true) as ReadonlySet<string>)].sort()).toEqual(['added', 'edited', 'gone']);
  });

  it('is empty when nothing differs', () => {
    const r = asRecord({ a: [1] });
    expect((changeOf(r, r, true) as ReadonlySet<string>).size).toBe(0);
  });
});

describe('readsChange', () => {
  const rule = (referencedReads?: ValidationRule['referencedReads']): ValidationRule => ({ ...ruleNamed('RXN-001'), ...(referencedReads === undefined ? {} : { referencedReads }) }) as ValidationRule;
  const withoutDeclaration = { ...ruleNamed('RXN-001'), referencedReads: undefined } as ValidationRule;
  const edit = new Set(['names']);

  it('an undeclared rule may read anything', () => {
    expect(readsChange(withoutDeclaration, 'species', edit)).toBe(true);
    expect(readsChange(withoutDeclaration, 'species', new Set())).toBe(true);
  });

  it('a rule reads only the fields it names, of the kinds it names', () => {
    expect(readsChange(rule({ species: ['names'] }), 'species', edit)).toBe(true);
    expect(readsChange(rule({ species: ['review'] }), 'species', edit)).toBe(false);
    expect(readsChange(rule({ class: ['names'] }), 'species', edit)).toBe(false);
    expect(readsChange(rule({}), 'species', edit)).toBe(false);
    expect(readsChange(rule({ '*': ['names'] }), 'reagent', edit)).toBe(true);
    expect(readsChange(rule({ species: ['review'], '*': ['names'] }), 'species', edit)).toBe(true);
  });

  it('a record created or deleted changes everything about it, so any read of that kind counts, existence included', () => {
    expect(readsChange(rule({ species: [] }), 'species', 'all')).toBe(true);
    expect(readsChange(rule({ '*': [] }), 'class', 'all')).toBe(true);
    expect(readsChange(rule({ class: [] }), 'species', 'all')).toBe(false);
    expect(readsChange(rule({}), 'species', 'all')).toBe(false);
    expect(readsChange(rule({ species: [] }), 'species', edit)).toBe(false); // existence only: an edit cannot change it
  });

  it('referrerFilter answers per referrer kind, from the rules of that kind', () => {
    const rulesOf = rulesByKind(RULES);
    expect(referrerFilter(rulesOf, 'species', new Set(['names']))('reaction')).toBe(false);
    expect(referrerFilter(rulesOf, 'species', new Set(['review']))('reaction')).toBe(true); // RVW-002
    expect(referrerFilter(rulesOf, 'species', 'all')('reaction')).toBe(true); // REF-001
    expect(referrerFilter(rulesOf, 'class', new Set(['names']))('species')).toBe(false); // SPC-006 reads class.parentIds only
    expect(referrerFilter(rulesOf, 'class', new Set(['parentIds']))('species')).toBe(true);
  });
});

/** A small hub: one species that 120 reactions use (the ADV-012 shape), findings kept incrementally. */
function hubRun(rules: readonly ValidationRule[] = RULES): { run: IncrementalRun; hub: string; referrers: string[]; ran: Set<string>; ruleRuns: Map<string, Set<string>> } {
  const parsed = documentToState(generateDataset({ species: 60, classes: 3, reagents: 5, reactions: 120, relationshipsPerReaction: 1, topics: 2, shape: 'hub_explosion', seed: 7 }));
  if (!parsed.ok) throw new Error('duplicate IDs');
  const ran = new Set<string>();
  const ruleRuns = new Map<string, Set<string>>();
  const counting = createValidator(
    rules.map((rule): ValidationRule => ({
      ...rule,
      *check(record, ctx) {
        ran.add(`${record.kind}:${record.id}`);
        ruleRuns.set(`${record.kind}:${record.id}`, (ruleRuns.get(`${record.kind}:${record.id}`) ?? new Set<string>()).add(rule.id));
        yield* rule.check(record as never, ctx);
      },
    })),
  );
  const run = new IncrementalRun(parsed.state, counting);
  const hub = Object.keys(parsed.state.records.species).reduce((best, id) => (run.indexes.referrersOf(id).length > run.indexes.referrersOf(best).length ? id : best));
  const referrers = [...new Set(run.indexes.referrersOf(hub).filter((r) => r.owner.kind === 'reaction').map((r) => r.owner.id))];
  ran.clear();
  ruleRuns.clear();
  return { run, hub, referrers, ran, ruleRuns };
}
const reactionsRun = (ran: ReadonlySet<string>): string[] => [...ran].filter((key) => key.startsWith('reaction:'));

describe('a hub species with many referrers', () => {
  it('is used by enough reactions to matter', () => {
    expect(hubRun().referrers.length).toBeGreaterThanOrEqual(100);
  });

  it.each([
    ['renaming it', (h: Loose) => { (h['names'] as Loose)['canonical'] = 'Water, renamed'; }],
    ['adding an alias', (h: Loose) => { (h['names'] as Loose)['aliases'] = ['aqua']; }],
    ['editing its notes', (h: Loose) => { h['notes'] = 'A plain note.'; }],
    ['changing its classes', (h: Loose) => { h['classIds'] = []; }],
    ['making it an ion', (h: Loose) => { h['speciesKind'] = 'ion'; h['charge'] = 1; }],
  ])('%s re-runs no rule on any referrer, and findings still equal a full pass', (_name, change) => {
    const { run, hub, referrers, ran } = hubRun();
    const { scope } = run.apply((t) => change(rec(t, 'species', hub)));
    expect(referrers.filter((id) => has(scope, 'reaction', id))).toEqual([]);
    expect(reactionsRun(ran)).toEqual([]);
    expect(has(scope, 'species', hub)).toBe(true);
    run.expectEqualsFull(_name);
  });

  it('changing a field a referrer rule reads (review, RVW-002) re-runs every referrer', () => {
    const { run, hub, referrers, ran } = hubRun();
    const { scope } = run.apply((t) => { (rec(t, 'species', hub)['review'] as Loose)['lifecycle'] = 'draft'; });
    expect(referrers.every((id) => has(scope, 'reaction', id))).toBe(true);
    expect(reactionsRun(ran).length).toBe(referrers.length);
    expect(run.findings.all().filter((f) => f.ruleId === 'RVW-002').length).toBe(referrers.length);
    run.expectEqualsFull('hub becomes a draft');
  });

  it('deleting the hub, and creating it again, re-runs every referrer (existence is read by REF-001)', () => {
    const { run, hub, referrers } = hubRun();
    const saved = JSON.parse(JSON.stringify(run.state.records.species[hub])) as unknown;
    const deleted = run.apply((t) => { Reflect.deleteProperty(t.species, hub); });
    expect(referrers.every((id) => has(deleted.scope, 'reaction', id))).toBe(true);
    expect(run.findings.all().filter((f) => f.ruleId === 'REF-001').length).toBeGreaterThanOrEqual(referrers.length);
    run.expectEqualsFull('hub deleted');
    const restored = run.apply((t) => { t.species[hub] = saved; });
    expect(referrers.every((id) => has(restored.scope, 'reaction', id))).toBe(true);
    expect(run.findings.all().filter((f) => f.ruleId === 'REF-001')).toEqual([]);
    run.expectEqualsFull('hub restored');
  });

  it('without a previous state nothing can be diffed, so every referrer is re-run (safe)', () => {
    const { run, hub, referrers } = hubRun();
    const scope = createValidator().scopeOf(run.state, run.indexes, [{ kind: 'species', id: hub }]);
    expect(referrers.every((id) => has(scope, 'reaction', id))).toBe(true);
  });

  it('a single undeclared rule of the referrer kind keeps the old behaviour: every referrer re-runs on any change', () => {
    const { run, hub, referrers, ran } = hubRun(RULES.map((rule) => (rule.id === 'RXN-006' ? ({ ...rule, referencedReads: undefined } as ValidationRule) : rule)));
    const { scope } = run.apply((t) => { (rec(t, 'species', hub)['names'] as Loose)['canonical'] = 'Renamed'; });
    expect(referrers.every((id) => has(scope, 'reaction', id))).toBe(true);
    expect(reactionsRun(ran).length).toBe(referrers.length);
    run.expectEqualsFull('rename with one undeclared rule');
  });
});

/** The one place a rule's declared fields are exercised on both sides: the read field re-runs it, another does not. */
describe('rules that declare fields', () => {
  const base = loadFixtureState('maximal-valid');
  const all = (state: CanonicalState, kind: RecordKind): AnyRecord[] => Object.values(state.records[kind] as Readonly<Record<string, AnyRecord>>);

  it('RXN-013 reads the generic reaction\'s scope and instanceOfId, not its name', () => {
    const [a, b, c] = all(base, 'reaction').map((r) => r.id);
    const run = new IncrementalRun(base);
    run.apply((t) => { Object.assign(rec(t, 'reaction', a as string), { scope: 'specific', instanceOfId: b }); Object.assign(rec(t, 'reaction', b as string), { scope: 'generic' }); delete rec(t, 'reaction', b as string)['instanceOfId']; });
    run.expectEqualsFull('instance set up');
    expect(has(run.apply((t) => { rec(t, 'reaction', b as string)['name'] = 'Another name'; }).scope, 'reaction', a as string)).toBe(false);
    const nested = run.apply((t) => { rec(t, 'reaction', b as string)['instanceOfId'] = c; });
    expect(has(nested.scope, 'reaction', a as string)).toBe(true);
    run.expectEqualsFull('the generic reaction became an instance');
    expect(run.findings.all().some((f) => f.ruleId === 'RXN-013' && f.subject.id === a)).toBe(true);
    expect(has(run.apply((t) => { rec(t, 'reaction', b as string)['scope'] = 'specific'; }).scope, 'reaction', a as string)).toBe(true);
    run.expectEqualsFull('the generic reaction became specific');
  });

  it('REL-006 reads an endpoint reaction\'s reversibility, not its name', () => {
    const [a, b] = all(base, 'reaction').map((r) => r.id);
    const relationship = must(all(base, 'relationship')[0]);
    const run = new IncrementalRun(base);
    run.apply((t) => { Object.assign(rec(t, 'relationship', relationship.id), { type: 'reverse_of', reverseKind: 'microscopic', from: { kind: 'reaction', id: a }, to: { kind: 'reaction', id: b } }); });
    run.expectEqualsFull('reverse link set up');
    expect(has(run.apply((t) => { rec(t, 'reaction', a as string)['name'] = 'Renamed'; }).scope, 'relationship', relationship.id)).toBe(false);
    const flipped = run.apply((t) => { rec(t, 'reaction', a as string)['reversibility'] = { kind: 'irreversible' }; });
    expect(has(flipped.scope, 'relationship', relationship.id)).toBe(true);
    expect(run.findings.all().some((f) => f.ruleId === 'REL-006' && f.subject.id === relationship.id)).toBe(true);
    run.expectEqualsFull('endpoint became irreversible');
  });

  it('CLS-001 reads the classIds of an example species, not its notes', () => {
    const cls = must(all(base, 'class')[0]);
    // A species that does not list the class, so the class is only its referrer (not also its referent).
    const species = must(all(base, 'species').find((s) => !(s as unknown as { classIds: string[] }).classIds.includes(cls.id)));
    // HIER-001 (undeclared: it walks the hierarchy) would keep every class in scope, so leave it out here.
    const run = new IncrementalRun(base, createValidator(RULES.filter((r) => r.id !== 'HIER-001')));
    run.apply((t) => { rec(t, 'class', cls.id)['exampleSpeciesIds'] = [species.id]; });
    expect(has(run.apply((t) => { rec(t, 'species', species.id)['notes'] = 'unrelated'; }).scope, 'class', cls.id)).toBe(false);
    expect(has(run.apply((t) => { rec(t, 'species', species.id)['classIds'] = []; }).scope, 'class', cls.id)).toBe(true);
    run.expectEqualsFull('example species lost its classes');
    expect(run.findings.all().some((f) => f.ruleId === 'CLS-001' && f.subject.id === cls.id)).toBe(true);
  });

  it('HIER-002 reads the kind of the parent topic', () => {
    // The child is also a peer of any touched parent (HIER-001 names descendants), so only the positive side shows.
    const child = must(all(base, 'topic').find((t) => 'parentId' in t && t.parentId !== undefined)) as AnyRecord & { parentId: string };
    const run = new IncrementalRun(base);
    expect(has(run.apply((t) => { rec(t, 'topic', child.parentId)['topicKind'] = 'subtopic'; }).scope, 'topic', child.id)).toBe(true);
    expect(run.findings.all().some((f) => f.ruleId === 'HIER-002' && f.subject.id === child.id)).toBe(true);
    run.expectEqualsFull('parent became finer-grained');
  });

  it('CUR-005 reads what kind of reference an official version cites; CUR-003 the exam a version belongs to', () => {
    const version = must(all(base, 'exam_version')[0]) as AnyRecord & { citations: { referenceId: string }[] };
    const cited = must(version.citations[0]).referenceId;
    const run = new IncrementalRun(base);
    run.apply((t) => { rec(t, 'exam_version', version.id)['status'] = 'official'; });
    expect(has(run.apply((t) => { rec(t, 'reference', cited)['notes'] = 'a note'; }).scope, 'exam_version', version.id)).toBe(false);
    expect(has(run.apply((t) => { rec(t, 'reference', cited)['refKind'] = 'textbook'; }).scope, 'exam_version', version.id)).toBe(true);
    expect(run.findings.all().some((f) => f.ruleId === 'CUR-005' && f.subject.id === version.id)).toBe(true);
    run.expectEqualsFull('cited reference is no longer a syllabus document');
    const relevance = must(all(base, 'exam_relevance').find((r) => 'examVersionIds' in r && (r as unknown as { examVersionIds: string[] }).examVersionIds.includes(version.id)));
    const label = run.apply((t) => { rec(t, 'exam_version', version.id)['label'] = 'Relabelled'; });
    expect(has(label.scope, 'exam_relevance', relevance.id)).toBe(true); // the label is in CUR-003's message
    const rename = run.apply((t) => { rec(t, 'exam_version', version.id)['tags'] = ['unrelated']; });
    expect(has(rename.scope, 'exam_relevance', relevance.id)).toBe(false);
    run.expectEqualsFull('exam version relabelled');
  });

  it('REF-005 reads the nested IDs inside the record a reference names', () => {
    const reaction = must(all(base, 'reaction').find((r) => (r as unknown as { participants: { profileId?: string }[] }).participants.some((p) => p.profileId !== undefined))) as unknown as { id: string; participants: { ref: { id: string }; profileId?: string }[] };
    const reagentId = must(reaction.participants.find((p) => p.profileId !== undefined)).ref.id;
    const run = new IncrementalRun(base);
    expect(has(run.apply((t) => { rec(t, 'reagent', reagentId)['notes'] = 'unrelated'; }).scope, 'reaction', reaction.id)).toBe(false);
    const gone = run.apply((t) => { rec(t, 'reagent', reagentId)['profiles'] = []; });
    expect(has(gone.scope, 'reaction', reaction.id)).toBe(true);
    expect(run.findings.all().some((f) => f.ruleId === 'REF-005' && f.subject.id === reaction.id)).toBe(true);
    run.expectEqualsFull('reagent lost its profiles');
  });
});

describe('per-rule referrer re-validation (ADR-032)', () => {
  const primary = (t: Tables, id: string): void => {
    const ps = (rec(t, 'reaction', id)['participants'] as Loose[]).slice(0, 2);
    for (const p of ps) p['isPrimarySubstrate'] = true;
  };

  it('a change to a field one rule reads re-runs that rule alone on every referrer', () => {
    const { run, hub, referrers, ruleRuns } = hubRun();
    const edit = run.apply((t) => { (rec(t, 'species', hub)['review'] as Loose)['lifecycle'] = 'draft'; });
    expect(referrers.some((id) => has(edit.whole, 'reaction', id))).toBe(false);
    expect(edit.byRule.filter((e) => e.subject.kind === 'reaction').length).toBe(referrers.length);
    expect(edit.byRule.every((e) => e.ruleIds.length === 1 && e.ruleIds[0] === 'RVW-002')).toBe(true);
    for (const id of referrers) expect([...(ruleRuns.get(`reaction:${id}`) ?? [])]).toEqual(['RVW-002']);
    expect(run.findings.all().filter((f) => f.ruleId === 'RVW-002').length).toBe(referrers.length);
    run.expectEqualsFull('hub became a draft');
  });

  it('a referrer\'s findings from rules that did not run survive the per-rule replace', () => {
    const { run, hub, referrers } = hubRun();
    const first = referrers[0] as string;
    run.apply((t) => primary(t, first));
    const before = run.findings.bySubject({ kind: 'reaction', id: first }).filter((f) => f.ruleId === 'RXN-006');
    expect(before.length).toBe(1);
    run.apply((t) => { (rec(t, 'species', hub)['review'] as Loose)['lifecycle'] = 'draft'; });
    expect(run.findings.bySubject({ kind: 'reaction', id: first }).map((f) => f.ruleId)).toEqual(expect.arrayContaining(['RXN-006', 'RVW-002']));
    expect(run.findings.bySubject({ kind: 'reaction', id: first }).filter((f) => f.ruleId === 'RXN-006')).toEqual(before);
    run.apply((t) => { (rec(t, 'species', hub)['review'] as Loose)['lifecycle'] = 'published'; });
    expect(run.findings.bySubject({ kind: 'reaction', id: first }).map((f) => f.ruleId)).toContain('RXN-006');
    expect(run.findings.bySubject({ kind: 'reaction', id: first }).map((f) => f.ruleId)).not.toContain('RVW-002');
    run.expectEqualsFull('draft, then published again');
  });

  it('a referrer with an L2 ERROR has no L3 findings, so the per-rule pass leaves it alone', () => {
    const { run, hub, referrers } = hubRun();
    const broken = referrers[1] as string;
    run.apply((t) => { ((rec(t, 'reaction', broken)['participants'] as Loose[])[0] as Loose)['ref'] = { kind: 'species', id: 'spc_ghost' }; });
    expect(run.findings.bySubject({ kind: 'reaction', id: broken }).some((f) => f.ruleId === 'REF-001')).toBe(true);
    const edit = run.apply((t) => { (rec(t, 'species', hub)['review'] as Loose)['lifecycle'] = 'draft'; });
    expect(edit.byRule.some((e) => e.subject.id === broken)).toBe(false);
    expect(run.findings.bySubject({ kind: 'reaction', id: broken }).some((f) => f.ruleId === 'RVW-002')).toBe(false);
    run.expectEqualsFull('hub draft with one broken referrer');
    run.apply((t) => { ((rec(t, 'reaction', broken)['participants'] as Loose[])[0] as Loose)['ref'] = { kind: 'species', id: hub }; });
    run.expectEqualsFull('the broken referrer is repaired');
  });

  it('a change that an L2 rule reads (existence, REF-001) still re-validates a referrer whole', () => {
    const { run, hub, referrers } = hubRun();
    const edit = run.apply((t) => { Reflect.deleteProperty(t.species, hub); });
    expect(referrers.every((id) => has(edit.whole, 'reaction', id))).toBe(true);
    expect(edit.byRule.filter((e) => e.subject.kind === 'reaction')).toEqual([]);
  });

  it('scopeOf is the whole subjects plus the per-rule subjects, and without previous nothing is partial', () => {
    const { run, hub } = hubRun();
    const validator = createValidator();
    const next = run.apply((t) => { (rec(t, 'species', hub)['review'] as Loose)['lifecycle'] = 'draft'; });
    const touched = [{ kind: 'species', id: hub }] as const;
    const legacy = validator.scopeOf(run.state, run.indexes, touched, undefined);
    const byRule = validator.validateTouchedByRule(run.state, run.indexes, touched, undefined, run.findings);
    expect(byRule.byRule).toEqual([]);
    expect(byRule.scope).toEqual(legacy);
    expect(next.scope.length).toBeGreaterThan(next.whole.length);
  });

  describe('a class hub (every species lists it)', () => {
    const classHubRun = () => {
      const parsed = documentToState(generateDataset({ species: 60, classes: 4, reagents: 3, reactions: 20, relationshipsPerReaction: 0, topics: 2, shape: 'hub_explosion', seed: 5 }));
      if (!parsed.ok) throw new Error('duplicate IDs');
      const ran = new Map<string, Set<string>>();
      const counting = createValidator(RULES.map((rule): ValidationRule => ({
        ...rule,
        *check(record, ctx) {
          ran.set(`${record.kind}:${record.id}`, (ran.get(`${record.kind}:${record.id}`) ?? new Set<string>()).add(rule.id));
          yield* rule.check(record as never, ctx);
        },
      })));
      const run = new IncrementalRun(parsed.state, counting);
      const classHub = Object.keys(parsed.state.records.class).reduce((best, id) => (run.indexes.referrersOf(id).length > run.indexes.referrersOf(best).length ? id : best));
      ran.clear();
      const speciesRuns = (): [string, Set<string>][] => [...ran].filter(([key]) => key.startsWith('species:'));
      return { run, classHub, ran, speciesRuns };
    };

    it.each([
      ['renaming it', (c: Loose) => { (c['names'] as Loose)['canonical'] = 'Renamed class hub'; }],
      ['adding an alias', (c: Loose) => { (c['names'] as Loose)['aliases'] = ['a hub']; }],
      ['editing its notes', (c: Loose) => { c['notes'] = 'A note.'; }],
    ])('%s re-runs nothing on its species (SPC-006 reads parentIds only: peerReads)', (_name, change) => {
      const { run, classHub, speciesRuns } = classHubRun();
      const edit = run.apply((t) => change(rec(t, 'class', classHub)));
      expect(speciesRuns()).toEqual([]);
      expect(edit.scope.some((r) => r.kind === 'species')).toBe(false);
      run.expectEqualsFull(_name);
    });

    it('moving it under another parent re-runs SPC-006, and only SPC-006, on each species that lists it (a peer named by one L3 rule)', () => {
      const { run, classHub, ran, speciesRuns } = classHubRun();
      // Every generated class descends from the hub, so add a spare root to move it under without a cycle.
      run.apply((t) => { t.class['cls_spare-root'] = { ...JSON.parse(JSON.stringify(t.class[classHub])) as Loose, id: 'cls_spare-root', parentIds: [], exampleSpeciesIds: [], names: { canonical: 'Spare root', aliases: [], common: [] } }; });
      ran.clear();
      const edit = run.apply((t) => { rec(t, 'class', classHub)['parentIds'] = ['cls_spare-root']; });
      expect(speciesRuns().length).toBeGreaterThan(50);
      expect(speciesRuns().every(([, rules]) => [...rules].every((id) => id === 'SPC-006'))).toBe(true);
      expect(edit.whole.some((r) => r.kind === 'species')).toBe(false);
      run.expectEqualsFull('class hub moved');
    });
  });
});
