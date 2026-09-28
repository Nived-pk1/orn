import { describe, expect, it, vi } from 'vitest';
import type { RecordRef } from '../schema';
import type { Finding, Severity, ValidationLevel } from './contracts';
import { makeFinding } from './findings';
import { createFindingStore } from './store';

const A: RecordRef = { kind: 'reaction', id: 'rxn_a' };
const B: RecordRef = { kind: 'species', id: 'spc_b' };

function finding(subject: RecordRef, ruleId: string, severity: Severity, level: ValidationLevel = 3, path?: string, message = 'm'): Finding {
  return makeFinding({ id: ruleId, level, severity }, subject, { ...(path === undefined ? {} : { path }), message });
}

describe('finding store', () => {
  it('starts empty', () => {
    const store = createFindingStore();
    expect(store.all()).toEqual([]);
    expect(store.bySubject(A)).toEqual([]);
    expect(store.counts()).toEqual({ error: 0, warning: 0, info: 0, review_required: 0 });
  });

  it('holds findings by subject and counts them by severity', () => {
    const store = createFindingStore();
    store.replaceForSubjects([A, B], [finding(A, 'RXN-001', 'error'), finding(A, 'RXN-005', 'warning'), finding(B, 'SPC-004', 'info')], 3);
    expect(store.bySubject(A).map((f) => f.ruleId)).toEqual(['RXN-001', 'RXN-005']);
    expect(store.bySubject(B).map((f) => f.ruleId)).toEqual(['SPC-004']);
    expect(store.counts()).toEqual({ error: 1, warning: 1, info: 1, review_required: 0 });
    expect(store.all()).toHaveLength(3);
  });

  it('replaces only the given subjects and level: a fixed problem disappears, others stay', () => {
    const store = createFindingStore();
    store.replaceForSubjects([A, B], [finding(A, 'RXN-001', 'error'), finding(B, 'SPC-004', 'info')], 3);
    store.replaceForSubjects([A], [finding(A, 'REF-001', 'error', 2, 'p')], 2);
    expect(store.bySubject(A).map((f) => f.ruleId)).toEqual(['REF-001', 'RXN-001']);
    store.replaceForSubjects([A], [], 3);
    expect(store.bySubject(A).map((f) => f.ruleId)).toEqual(['REF-001']);
    expect(store.bySubject(B)).toHaveLength(1);
    store.replaceForSubjects([A], [], 2);
    expect(store.bySubject(A)).toEqual([]);
    expect(store.counts().error).toBe(0);
  });

  it('keeps the same finding ID for the same unfixed problem across replacements', () => {
    const store = createFindingStore();
    store.replaceForSubjects([A], [finding(A, 'RXN-001', 'error', 3, 'p', 'first wording')], 3);
    const before = must(store.bySubject(A)[0]).id;
    store.replaceForSubjects([A], [finding(A, 'RXN-001', 'error', 3, 'p', 'second wording')], 3);
    expect(must(store.bySubject(A)[0]).id).toBe(before);
    expect(must(store.bySubject(A)[0]).message).toBe('second wording');
  });

  it('filters by severity and by level', () => {
    const store = createFindingStore();
    store.replaceForSubjects([A], [finding(A, 'RXN-001', 'error'), finding(A, 'RXN-005', 'warning')], 3);
    store.replaceForSubjects([A], [finding(A, 'CHEM-001', 'warning', 4)], 4);
    expect(store.all({ severity: 'warning' }).map((f) => f.ruleId)).toEqual(['CHEM-001', 'RXN-005']);
    expect(store.all({ level: 4 }).map((f) => f.ruleId)).toEqual(['CHEM-001']);
    expect(store.all({ severity: 'warning', level: 3 }).map((f) => f.ruleId)).toEqual(['RXN-005']);
  });

  it('orders results deterministically, independent of insertion order', () => {
    const list = [finding(B, 'SPC-004', 'info'), finding(A, 'RXN-005', 'warning', 3, 'b'), finding(A, 'RXN-005', 'warning', 3, 'a'), finding(A, 'RXN-001', 'error')];
    const one = createFindingStore();
    const two = createFindingStore();
    one.replaceForSubjects([A, B], list, 3);
    two.replaceForSubjects([B, A], [...list].reverse(), 3);
    expect(one.all()).toEqual(two.all());
    expect(one.all().map((f) => f.subject.id)).toEqual(['rxn_a', 'rxn_a', 'rxn_a', 'spc_b']);
  });

  it('returns stable snapshots that change identity only when content changes', () => {
    const store = createFindingStore();
    store.replaceForSubjects([A], [finding(A, 'RXN-001', 'error')], 3);
    const all = store.all();
    const one = store.bySubject(A);
    const counts = store.counts();
    store.replaceForSubjects([A], [finding(A, 'RXN-001', 'error')], 3);
    expect(store.all()).toBe(all);
    expect(store.bySubject(A)).toBe(one);
    expect(store.counts()).toBe(counts);
    store.replaceForSubjects([A], [finding(A, 'RXN-001', 'warning')], 3);
    expect(store.all()).not.toBe(all);
    expect(store.bySubject(A)).not.toBe(one);
  });

  it('hands out frozen snapshots', () => {
    const store = createFindingStore();
    store.replaceForSubjects([A], [finding(A, 'RXN-001', 'error')], 3);
    expect(Object.isFrozen(store.all())).toBe(true);
    expect(Object.isFrozen(store.bySubject(A))).toBe(true);
    expect(Object.isFrozen(store.counts())).toBe(true);
  });

  it('notifies subscribers once per effective change, never for a no-op, and stops after unsubscribe', () => {
    const store = createFindingStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.replaceForSubjects([A, B], [finding(A, 'RXN-001', 'error'), finding(B, 'SPC-004', 'info')], 3);
    expect(listener).toHaveBeenCalledTimes(1);
    store.replaceForSubjects([A, B], [finding(A, 'RXN-001', 'error'), finding(B, 'SPC-004', 'info')], 3);
    store.replaceForSubjects([], [], 3);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    store.replaceForSubjects([A], [], 3);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('lets every subscriber run even if one throws, then rethrows the first error', () => {
    const store = createFindingStore();
    const after = vi.fn();
    store.subscribe(() => {
      throw new Error('boom');
    });
    store.subscribe(after);
    expect(() => store.replaceForSubjects([A], [finding(A, 'RXN-001', 'error')], 3)).toThrow('boom');
    expect(after).toHaveBeenCalledTimes(1);
    expect(store.bySubject(A)).toHaveLength(1);
  });

  it('rejects findings of another level or about an unlisted subject, changing nothing (programmer errors)', () => {
    const store = createFindingStore();
    expect(() => store.replaceForSubjects([A], [finding(A, 'CHEM-001', 'warning', 4)], 3)).toThrow(TypeError);
    expect(() => store.replaceForSubjects([A], [finding(B, 'SPC-004', 'info')], 3)).toThrow(TypeError);
    expect(store.all()).toEqual([]);
  });

  it('treats a kind and an ID together as the subject', () => {
    const store = createFindingStore();
    const other: RecordRef = { kind: 'class', id: 'rxn_a' };
    store.replaceForSubjects([A, other], [finding(A, 'RXN-001', 'error')], 3);
    expect(store.bySubject(other)).toEqual([]);
  });
});

describe('finding store: replaceForRules (ADR-032)', () => {
  const seeded = () => {
    const store = createFindingStore();
    store.replaceForSubjects([A, B], [finding(A, 'REF-008', 'warning', 2, 'notes'), finding(B, 'REF-008', 'warning', 2, 'notes')], 2);
    store.replaceForSubjects([A, B], [finding(A, 'RXN-001', 'error'), finding(A, 'RVW-002', 'info'), finding(B, 'SPC-004', 'info'), finding(B, 'RVW-002', 'info')], 3);
    return store;
  };

  it("replaces only the listed rules' findings; every other finding of the subject survives, at every level", () => {
    const store = seeded();
    store.replaceForRules([A], ['RVW-002'], []);
    expect(store.bySubject(A).map((f) => f.ruleId)).toEqual(['REF-008', 'RXN-001']);
    store.replaceForRules([A], ['RVW-002'], [finding(A, 'RVW-002', 'info', 3, 'review.lifecycle', 'new wording')]);
    expect(store.bySubject(A).map((f) => f.ruleId)).toEqual(['REF-008', 'RVW-002', 'RXN-001']);
    expect(must(store.bySubject(A).find((f) => f.ruleId === 'RVW-002')).message).toBe('new wording');
    expect(store.counts()).toEqual({ error: 1, warning: 2, info: 3, review_required: 0 });
  });

  it("does not touch subjects that are not listed, and one call can replace rules at more than one level", () => {
    const store = seeded();
    store.replaceForRules([A], ['REF-008', 'RVW-002'], [finding(A, 'RVW-002', 'info', 3, 'p')]);
    expect(store.bySubject(A).map((f) => f.ruleId)).toEqual(['RVW-002', 'RXN-001']);
    expect(store.bySubject(B).map((f) => f.ruleId)).toEqual(['REF-008', 'RVW-002', 'SPC-004']);
  });

  it('keeps the same finding ID for an unchanged problem and notifies only when something changed', () => {
    const store = seeded();
    const listener = vi.fn();
    store.subscribe(listener);
    const before = must(store.bySubject(A).find((f) => f.ruleId === 'RVW-002'));
    store.replaceForRules([A, B], ['RVW-002'], [finding(A, 'RVW-002', 'info'), finding(B, 'RVW-002', 'info')]);
    expect(listener).not.toHaveBeenCalled();
    expect(must(store.bySubject(A).find((f) => f.ruleId === 'RVW-002')).id).toBe(before.id);
    store.replaceForRules([A, B], ['RVW-002'], [finding(A, 'RVW-002', 'info')]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.bySubject(B).map((f) => f.ruleId)).toEqual(['REF-008', 'SPC-004']);
  });

  it('is a no-op on a subject with nothing of those rules, and leaves the snapshots stable', () => {
    const store = createFindingStore();
    const empty = store.all();
    store.replaceForRules([A], ['RVW-002'], []);
    expect(store.all()).toBe(empty);
    expect(store.bySubject(A)).toEqual([]);
  });

  it('rejects a finding about an unlisted subject or of an unlisted rule, changing nothing (programmer errors)', () => {
    const store = seeded();
    const snapshot = store.all();
    expect(() => store.replaceForRules([A], ['RVW-002'], [finding(B, 'RVW-002', 'info')])).toThrow(TypeError);
    expect(() => store.replaceForRules([A], ['RVW-002'], [finding(A, 'RXN-001', 'error')])).toThrow(TypeError);
    expect(store.all()).toBe(snapshot);
  });

  it('leaves whole-subject replacement as it was: replaceForSubjects still replaces a level entirely', () => {
    const store = seeded();
    store.replaceForRules([A], ['RVW-002'], []);
    store.replaceForSubjects([A], [], 3);
    expect(store.bySubject(A).map((f) => f.ruleId)).toEqual(['REF-008']);
  });
});

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing');
  return value;
}
