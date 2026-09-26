/**
 * L2 reference rules against the invalid fixtures (each must raise exactly its declared rule on its
 * declared record and field, and nothing else there), the valid fixtures (INV-04, INV-05, INV-07) and
 * targeted edits of the maximal fixture (INV-01, INV-24).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { documentToState } from '../../dataset';
import { coreIndexEngine } from '../../indexes/engine';
import { RECORD_KINDS, type AnyRecord, type CanonicalState, type DatasetDocument, type RecordKind } from '../../schema';
import { commit, loadFixtureState, must, remove } from '../../../test-support/state-fixture';
import type { Finding, RuleContext } from '../contracts';
import { runRules } from '../runner';
import { REFERENCE_RULES } from './references';

const DIR = new URL('../../../../data/fixtures/schema/v1/invalid/', import.meta.url);

interface Case {
  readonly file: string;
  readonly level: 'L1' | 'L2';
  readonly rule: string;
  readonly severity: 'ERROR' | 'WARNING';
  readonly record?: { readonly kind: RecordKind; readonly id: string };
  readonly field?: string;
}
const cases = (JSON.parse(readFileSync(new URL('manifest.json', DIR), 'utf8')) as { cases: Case[] }).cases.filter(
  (c) => c.level === 'L2' && c.file !== 'l2-ref-006-duplicate-record-id.json',
);

const recordsOf = (state: CanonicalState): AnyRecord[] =>
  RECORD_KINDS.flatMap((kind) => Object.values(state.records[kind] as Record<string, AnyRecord>));

function findingsFor(state: CanonicalState, only?: { kind: RecordKind; id: string }): Finding[] {
  const ctx: RuleContext = { state, indexes: coreIndexEngine.build(state) };
  const records = only === undefined ? recordsOf(state) : [must(recordsOf(state).find((r) => r.id === only.id))];
  return records.flatMap((record) => [...runRules(REFERENCE_RULES, record, ctx)]);
}

function stateOfFixture(file: string): CanonicalState {
  const result = documentToState(JSON.parse(readFileSync(new URL(file, DIR), 'utf8')) as DatasetDocument);
  if (!result.ok) throw new Error(`${file} has duplicate record IDs`);
  return result.state;
}

/** Registry path with indices → `[]`, to compare a concrete finding path with a manifest field. */
const generic = (path: string | undefined): string => (path ?? '').replace(/\[\d+\]/g, '[]');

describe.each(cases)('L2 fixture $file', (entry) => {
  const state = stateOfFixture(entry.file);
  const subject = must(entry.record);

  it(`raises ${entry.rule} on ${subject.id} at ${entry.field}, and no other REF finding there`, () => {
    const findings = findingsFor(state, subject);
    const wanted = findings.filter((f) => f.ruleId === entry.rule && generic(f.path).startsWith(must(entry.field).replace(/\[\]$/, '')));
    expect(wanted.length, JSON.stringify(findings.map((f) => [f.ruleId, f.path]))).toBeGreaterThan(0);
    expect(findings.map((f) => f.ruleId)).toEqual(findings.map(() => entry.rule));
    expect(wanted[0]?.severity).toBe(entry.severity.toLowerCase());
    expect(wanted[0]?.level).toBe(2);
    expect(wanted[0]?.subject).toEqual(subject);
  });

  it('leaves every other record of the fixture free of REF findings', () => {
    const others = findingsFor(state).filter((f) => f.subject.id !== subject.id);
    // REF-006 is symmetric: both defining records are reported.
    const expected = entry.rule === 'REF-006' ? new Set(others.map((f) => f.subject.id)).size : 0;
    expect(new Set(others.map((f) => f.subject.id)).size).toBe(expected);
  });
});

describe('valid fixtures', () => {
  it.each(['minimal-valid', 'maximal-valid'] as const)('%s has no reference findings (INV-04, INV-05, INV-07)', (name) => {
    expect(findingsFor(loadFixtureState(name))).toEqual([]);
  });
});

describe('precedence and wording', () => {
  it('reports only REF-003 for a reference to a higher layer that is also not an allowed kind', () => {
    const findings = findingsFor(stateOfFixture('l2-ref-003-higher-layer.json'));
    expect(findings.map((f) => f.ruleId)).toEqual(['REF-003']);
  });

  it('gives every finding plain text with the offending path and a related record for REF-001', () => {
    const findings = findingsFor(stateOfFixture('l2-ref-001-dangling.json'));
    const [finding] = findings;
    expect(findings).toHaveLength(1);
    expect(finding?.path).toMatch(/^classIds\[\d+\]$/);
    expect(finding?.message).toContain(String(finding?.data?.['targetId']));
    expect(finding?.related).toEqual([{ kind: 'class', id: String(finding?.data?.['targetId']) }]);
  });

  it('is deterministic and the same for a fresh index of the same state', () => {
    const state = stateOfFixture('l2-ref-005-nested-unresolved.json');
    expect(findingsFor(state)).toEqual(findingsFor(state));
  });
});

describe('edits of the maximal fixture', () => {
  const base = loadFixtureState('maximal-valid');
  const reaction = must(Object.values(base.records.reaction).find((r) => r.outcomes.length > 0 && r.participants.length > 1));

  it('reports dependents of a deleted record as REF-001 without touching any data (INV-24)', () => {
    const user = must(Object.values(base.records.reaction).find((r) => r.participants.some((p) => p.ref.kind === 'species')));
    const referenced = must(user.participants.find((p) => p.ref.kind === 'species')).ref.id;
    const { after } = commit(base, 1, (t) => remove(t, 'species', referenced));
    const findings = findingsFor(after).filter((f) => f.ruleId === 'REF-001');
    expect(findings.some((f) => f.subject.id === user.id && f.data?.['targetId'] === referenced)).toBe(true);
    expect(recordsOf(after).length).toBe(recordsOf(base).length - 1);
  });

  it('flags a nested ID defined by two records on both, and one repeated inside a record (REF-006, INV-01)', () => {
    const other = must(Object.values(base.records.reaction).find((r) => r.id !== reaction.id));
    const shared = must(reaction.participants[0]).id;
    const { after } = commit(base, 1, (t) => {
      const target = t.reaction[other.id] as { participants: { id: string }[] };
      target.participants = [...target.participants, { ...must(reaction.participants[0]), id: shared }];
    });
    const dups = findingsFor(after).filter((f) => f.ruleId === 'REF-006');
    expect(new Set(dups.map((f) => f.subject.id))).toEqual(new Set([reaction.id, other.id]));
    expect(dups.every((f) => f.data?.['id'] === shared)).toBe(true);
    expect(dups.find((f) => f.subject.id === reaction.id)?.related).toEqual([{ kind: 'reaction', id: other.id }]);

    const { after: within } = commit(base, 1, (t) => {
      const target = t.reaction[reaction.id] as { participants: { id: string }[] };
      target.participants = [...target.participants, { ...must(reaction.participants[0]) }];
    });
    const local = findingsFor(within).filter((f) => f.ruleId === 'REF-006');
    expect(local.length).toBe(2);
    expect(local.every((f) => f.subject.id === reaction.id && f.related.length === 0)).toBe(true);
    expect(local[0]?.path).not.toBe(local[1]?.path);
  });

  it('reports a rich-text field once with all its missing links, and ignores links that resolve', () => {
    const species = must(Object.values(base.records.species)[0]);
    const other = must(Object.values(base.records.species)[1]);
    const { after } = commit(base, 1, (t) => {
      (t.species[species.id] as { notes: string }).notes =
        `See [[${other.id}]], [[spc_gone-one]] and [[cls_gone-two]].`;
    });
    const links = findingsFor(after).filter((f) => f.ruleId === 'REF-008');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ path: 'notes', severity: 'warning', level: 2 });
    expect(links[0]?.related.map((r) => r.id)).toEqual(['spc_gone-one', 'cls_gone-two']);
    expect(links[0]?.message).not.toContain(other.id);
  });

  it('reports an unresolved nested reference once, on the referrer, when the container exists', () => {
    const scheme = must(Object.values(base.records.reaction_scheme)[0]);
    const { after } = commit(base, 1, (t) => {
      const placements = (t.reaction_scheme[scheme.id] as { placements: { participantId: string }[] }).placements;
      must(placements[0]).participantId = 'prt_not-there';
    });
    const found = findingsFor(after).filter((f) => f.ruleId === 'REF-005');
    expect(found.map((f) => [f.subject.id, f.path])).toEqual([[scheme.id, 'placements[0].participantId']]);
  });

  it('does not double-report a nested reference whose container is itself dangling', () => {
    const scheme = must(Object.values(base.records.reaction_scheme)[0]);
    const { after } = commit(base, 1, (t) => remove(t, 'reaction', scheme.reactionId));
    const forScheme = findingsFor(after).filter((f) => f.subject.id === scheme.id);
    expect(forScheme.map((f) => f.ruleId)).toEqual(['REF-001']);
  });
});

describe('rule metadata', () => {
  it('registers REF-001…REF-008 once each, at level 2, with kinds derived from the registries', () => {
    expect(REFERENCE_RULES.map((r) => r.id)).toEqual(['REF-001', 'REF-002', 'REF-003', 'REF-004', 'REF-005', 'REF-006', 'REF-007', 'REF-008']);
    for (const rule of REFERENCE_RULES) {
      expect(rule.level).toBe(2);
      expect(rule.kinds.length, rule.id).toBeGreaterThan(0);
      expect(rule.defaultSeverity).toBe(rule.id === 'REF-008' ? 'warning' : 'error');
    }
  });
});
