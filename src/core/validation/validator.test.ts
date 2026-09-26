/**
 * The validator: catalogue coverage, level gating, determinism, scope and abort behaviour, and the
 * whole-state properties INV-12 and INV-14 (ADV-028).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { coreIndexEngine } from '../indexes/engine';
import { LAYER_OF_KIND, RECORD_KINDS, type CanonicalState, type RecordKind } from '../schema';
import { add, cloneAs, drop, edit, recordOf, validateEverything } from '../../test-support/rule-harness';
import { commit, loadFixtureState, must } from '../../test-support/state-fixture';
import { EXTERNAL_RULES } from './rules/external';
import { L2_RULES, L3_RULES, RULES } from './rules/registry';
import { createFindingStore } from './store';
import { commitFindings, createValidator, validator } from './validator';

const minimal = loadFixtureState('minimal-valid');
const maximal = loadFixtureState('maximal-valid');
const catalogue = readFileSync(new URL('../../../docs/VALIDATION_RULES.md', import.meta.url), 'utf8');
const RXN = 'rxn_max-grignard-propanone';

describe('rule catalogue (VALIDATION_RULES.md §3)', () => {
  const documented = [...catalogue.matchAll(/^\| ([A-Z]+-\d{3}) \|/gm)].map((m) => m[1] as string);

  it('every documented rule ID is implemented here or owned by another layer, and nothing else is registered', () => {
    expect(documented.length).toBeGreaterThan(80);
    const implemented = new Set(RULES.map((r) => r.id));
    const unowned = documented.filter((id) => !implemented.has(id) && !(id in EXTERNAL_RULES));
    expect(unowned).toEqual([]);
    const undocumented = [...implemented].filter((id) => !documented.includes(id));
    expect(undocumented).toEqual([]);
    const both = Object.keys(EXTERNAL_RULES).filter((id) => implemented.has(id));
    expect(both).toEqual([]);
  });

  it('rules are well formed: unique IDs, a level, kinds, a description, and peers only where they can matter', () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
    expect(L2_RULES.every((r) => r.level === 2)).toBe(true);
    expect(L3_RULES.every((r) => r.level === 3)).toBe(true);
    for (const rule of RULES) {
      expect(rule.kinds.length, rule.id).toBeGreaterThan(0);
      expect(rule.description.length, rule.id).toBeGreaterThan(5);
      if (rule.scope === 'record') expect(rule.peers, `${rule.id} is record-scope`).toBeUndefined();
      if (rule.scope === 'global') expect(rule.peers, `${rule.id} is global`).toBeDefined();
    }
  });

  it('only IDs from the catalogue appear as prefixes of a rule family', () => {
    for (const rule of RULES) expect(rule.id).toMatch(/^(REF|RXN|SPC|CLS|RGT|HIER|MEC|REL|RTE|CAV|CUR|PRS|AST|RVW)-\d{3}$/);
  });
});

describe('validateAll', () => {
  it('committed fixtures have no L1–L3 ERROR (INV-12) and no L1 finding', () => {
    for (const state of [minimal, maximal]) {
      const found = validateEverything(state);
      expect(found.filter((f) => f.severity === 'error')).toEqual([]);
      expect(found.filter((f) => f.level === 1)).toEqual([]);
    }
  });

  it('reports what the maximal fixture is known to contain: review flags, parsed conditions, and incomplete classification', () => {
    const rules = new Set(validateEverything(maximal).map((f) => f.ruleId));
    expect([...rules].sort()).toEqual(['MEC-003', 'RGT-001', 'RVW-001', 'RXN-015', 'RXN-016']);
  });

  it('is deterministic and sorted by subject, level, rule and path', () => {
    const a = validateEverything(maximal);
    const b = validator.validateAll(maximal, coreIndexEngine.build(maximal));
    expect(a).toEqual(b);
    const key = (f: (typeof a)[number]): [number, string, number, string, string] => [RECORD_KINDS.indexOf(f.subject.kind), f.subject.id, f.level, f.ruleId, f.path ?? ''];
    const compare = (x: (typeof a)[number], y: (typeof a)[number]): number => {
      const [kx, ky] = [key(x), key(y)];
      for (let i = 0; i < kx.length; i += 1) {
        if (kx[i] !== ky[i]) return (kx[i] as string | number) < (ky[i] as string | number) ? -1 : 1;
      }
      return 0;
    };
    const sorted = [...a].sort(compare);
    expect(a.map((f) => f.id)).toEqual(sorted.map((f) => f.id));
  });

  it('stops with an AbortError when the signal is aborted', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => validator.validateAll(maximal, coreIndexEngine.build(maximal), controller.signal)).toThrow(/aborted/);
    try {
      validator.validateAll(maximal, coreIndexEngine.build(maximal), controller.signal);
    } catch (error) {
      expect((error as Error).name).toBe('AbortError');
    }
  });

  it('does not modify the state (INV-24)', () => {
    const before = JSON.stringify(maximal);
    validateEverything(maximal);
    expect(JSON.stringify(maximal)).toBe(before);
  });
});

describe('level gating', () => {
  it('a record that fails L1 gets SCHEMA findings only', () => {
    const broken = edit(maximal, 'reaction', RXN, (r) => { (r as { scope: string }).scope = 'sideways'; (r as { participants: unknown[] }).participants = []; });
    const found = validateEverything(broken).filter((f) => f.subject.id === RXN);
    expect(found.length).toBeGreaterThan(0);
    expect(new Set(found.map((f) => f.ruleId))).toEqual(new Set(['SCHEMA']));
  });

  it('a record with an L2 ERROR is not judged by L3, and is once the reference is repaired', () => {
    const noReactant = edit(maximal, 'reaction', RXN, (r) => { for (const p of r.participants) p.role = 'solvent'; });
    expect(validateEverything(noReactant).some((f) => f.subject.id === RXN && f.ruleId === 'RXN-001')).toBe(true);
    const dangling = edit(noReactant, 'reaction', RXN, (r) => { must(r.participants[0]).ref = { kind: 'species', id: 'spc_missing-one' } as never; });
    const rules = validateEverything(dangling).filter((f) => f.subject.id === RXN).map((f) => f.ruleId);
    expect(rules).toContain('REF-001');
    expect(rules).not.toContain('RXN-001');
  });

  it('a profile named on a non-reagent participant is RXN-011 alone, not also a reference error', () => {
    const state = edit(maximal, 'reaction', RXN, (r) => { must(r.participants[0]).profileId = 'rpf_xx' as never; });
    const rules = validateEverything(state).filter((f) => f.subject.id === RXN).map((f) => f.ruleId);
    expect(rules).toContain('RXN-011');
    expect(rules.filter((id) => id.startsWith('REF'))).toEqual([]);
  });

  it('WARNING-level L2 findings (REF-008) do not stop L3', () => {
    const state = edit(maximal, 'species', 'spc_max-water', (s) => { s.notes = 'See [[spc_gone-one]].'; s.review.status = 'review_required'; });
    const rules = validateEverything(state).filter((f) => f.subject.id === 'spc_max-water').map((f) => f.ruleId);
    expect(rules).toEqual(expect.arrayContaining(['REF-008', 'RVW-001']));
  });
});

describe('INV-14 / ADV-028: presentation records do not affect chemistry findings', () => {
  it('deleting every presentation record leaves the findings of chemistry records unchanged', () => {
    let stripped: CanonicalState = maximal;
    for (const kind of RECORD_KINDS.filter((k) => LAYER_OF_KIND[k] === 5)) {
      for (const id of Object.keys(maximal.records[kind])) stripped = drop(stripped, kind, id);
    }
    const chemistry = (state: CanonicalState) =>
      validateEverything(state).filter((f) => LAYER_OF_KIND[f.subject.kind] <= 2).map((f) => f.id);
    expect(chemistry(stripped)).toEqual(chemistry(maximal));
  });
});

describe('scopeOf and validateTouched', () => {
  const ix = coreIndexEngine.build(maximal);

  it('covers the touched record, its referrers and its referents', () => {
    const scope = validator.scopeOf(maximal, ix, [{ kind: 'species', id: 'spc_max-propanone' }]);
    const ids = scope.map((r) => r.id);
    expect(ids).toContain('spc_max-propanone');
    expect(ids).toContain(RXN); // a referrer
    expect(ids).toContain('cls_max-ketones'); // a referent, and a referrer through exampleSpeciesIds
    expect(new Set(ids).size).toBe(ids.length);
    expect(scope).toEqual(validator.scopeOf(maximal, ix, [{ kind: 'species', id: 'spc_max-propanone' }]));
  });

  it('includes peers: a species with the same name, found through the name index', () => {
    const twin = add(maximal, 'species', cloneAs(recordOf(maximal, 'species', 'spc_max-water'), 'spc_water-twin'));
    const ix2 = coreIndexEngine.build(twin);
    const scope = validator.scopeOf(twin, ix2, [{ kind: 'species', id: 'spc_water-twin' }]);
    expect(scope.map((r) => r.id)).toContain('spc_max-water');
  });

  it('includes a deleted record and, given the previous state, what it used to reference', () => {
    const { after, changes } = commit(maximal, 1, (t) => { Reflect.deleteProperty(t.relationship, 'rel_max-dehydration-hydration'); });
    const ix2 = coreIndexEngine.apply(coreIndexEngine.build(maximal), changes, after);
    const touched = changes.deleted;
    expect(touched.map((r) => r.id)).toEqual(['rel_max-dehydration-hydration']);
    const without = validator.scopeOf(after, ix2, touched).map((r) => r.id);
    const withPrevious = validator.scopeOf(after, ix2, touched, maximal).map((r) => r.id);
    expect(without).toEqual(['rel_max-dehydration-hydration']);
    expect(withPrevious).toEqual(expect.arrayContaining(['rel_max-dehydration-hydration', 'rxn_max-tbuoh-dehydration', 'rxn_max-isobutene-hydration']));
  });

  it('a change that makes a record clean removes its finding from the store, and one that breaks it adds one', () => {
    const EQ = 'rxn_max-tbuoh-dehydration';
    const equilibrium = edit(maximal, 'reaction', EQ, (r) => { r.reversibility = { kind: 'equilibrium' } as never; });
    let indexes = coreIndexEngine.build(equilibrium);
    const store = createFindingStore();
    const everyone = RECORD_KINDS.flatMap((kind) => Object.keys(equilibrium.records[kind]).map((id) => ({ kind, id })));
    commitFindings(store, everyone, validator.validateAll(equilibrium, indexes));
    expect(store.bySubject({ kind: 'reaction', id: EQ }).some((f) => f.ruleId === 'RXN-018')).toBe(false);

    // Deleting the relationship touches only the relationship; the reaction is its referent.
    const { after, changes } = commit(equilibrium, 1, (t) => { Reflect.deleteProperty(t.relationship, 'rel_max-dehydration-hydration'); });
    indexes = coreIndexEngine.apply(indexes, changes, after);
    const scope = validator.scopeOf(after, indexes, changes.deleted, equilibrium);
    commitFindings(store, scope, validator.validateTouched(after, indexes, changes.deleted, equilibrium));
    expect(store.bySubject({ kind: 'reaction', id: EQ }).map((f) => f.ruleId)).toContain('RXN-018');

    // And putting it back clears the finding again.
    const restored = commit(after, 2, (t) => { t.relationship['rel_max-dehydration-hydration'] = JSON.parse(JSON.stringify(recordOf(maximal, 'relationship', 'rel_max-dehydration-hydration'))); });
    indexes = coreIndexEngine.apply(indexes, restored.changes, restored.after);
    commitFindings(store, validator.scopeOf(restored.after, indexes, restored.changes.created, after), validator.validateTouched(restored.after, indexes, restored.changes.created, after));
    expect(store.bySubject({ kind: 'reaction', id: EQ }).map((f) => f.ruleId)).not.toContain('RXN-018');
  });

  it('validateTouched for nothing returns nothing', () => {
    expect(validator.validateTouched(maximal, ix, [])).toEqual([]);
    expect(validator.scopeOf(maximal, ix, [])).toEqual([]);
  });

  it('a validator can be built over a custom rule list', () => {
    const custom = createValidator(RULES.filter((r) => r.id === 'RXN-001'));
    const state = edit(maximal, 'reaction', RXN, (r) => { for (const p of r.participants) p.role = 'solvent'; });
    expect(custom.validateAll(state, coreIndexEngine.build(state)).map((f) => f.ruleId)).toEqual(['RXN-001']);
  });
});

describe('touching a kind lists it correctly', () => {
  it('every kind with a record in the fixture can be scoped without error', () => {
    const ix = coreIndexEngine.build(maximal);
    for (const kind of RECORD_KINDS as readonly RecordKind[]) {
      for (const id of Object.keys(maximal.records[kind]).slice(0, 2)) {
        expect(validator.scopeOf(maximal, ix, [{ kind, id }], maximal).some((r) => r.id === id)).toBe(true);
      }
    }
  });
});
