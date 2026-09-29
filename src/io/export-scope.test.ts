/**
 * Scope closure (docs/IMPLEMENTATION_PLAN.md §2 step 3.5, docs/PERSISTENCE.md §8): every named scope's output
 * must have no dangling reference (closure always on for full/chemistry/curriculum/presentation); `subset`
 * varies by `includeDependencies`. Uses the maximal fixture (every kind, an asset attached to a reaction,
 * curriculum records mapping a reaction, presentation records decorating chemistry) plus the demo dataset.
 */
import { describe, expect, it } from 'vitest';
import { RECORD_KINDS, type CanonicalState } from '@/core/schema';
import { buildDemoDocument } from '@/test-support/demo';
import { documentToState } from '@/core/dataset';
import { loadFixtureState } from '@/test-support/state-fixture';
import type { ExportOptions } from './contracts';
import { selectScope } from './export-scope';

const maximal = loadFixtureState('maximal-valid');
const demo = (() => {
  const result = documentToState(buildDemoDocument());
  if (!result.ok) throw new Error('demo dataset has duplicate IDs');
  return result.state;
})();

function withoutRecord(state: CanonicalState, kind: keyof CanonicalState['records'], id: string): CanonicalState {
  const table = { ...(state.records[kind] as Record<string, unknown>) };
  Reflect.deleteProperty(table, id);
  return { meta: state.meta, records: { ...state.records, [kind]: table } as CanonicalState['records'] };
}

function allIds(state: CanonicalState): Set<string> {
  const ids = new Set<string>();
  for (const kind of RECORD_KINDS) for (const id of Object.keys(state.records[kind] as Record<string, unknown>)) ids.add(id);
  return ids;
}

const closedScopes: readonly ExportOptions['scope'][] = ['full', 'chemistry', 'curriculum', 'presentation'];

describe('selectScope — full/chemistry/curriculum/presentation always close (no dangling reference)', () => {
  it.each(closedScopes)('%s: no missing references, on the maximal fixture', (scope) => {
    const result = selectScope(maximal, { scope, includeDependencies: false, assets: 'none' });
    expect(result.missingReferences).toEqual([]);
  });

  it.each(closedScopes)('%s: no missing references, on the demo dataset', (scope) => {
    const result = selectScope(demo, { scope, includeDependencies: false, assets: 'none' });
    expect(result.missingReferences).toEqual([]);
  });

  it('full: includes every record', () => {
    const result = selectScope(maximal, { scope: 'full', includeDependencies: false, assets: 'none' });
    expect(result.included).toEqual(allIds(maximal));
  });

  it('chemistry: every layer 1-2 record, plus an asset attached to a chemistry record, never a curriculum/presentation record', () => {
    const result = selectScope(maximal, { scope: 'chemistry', includeDependencies: false, assets: 'none' });
    for (const id of Object.keys(maximal.records.reference)) expect(result.included.has(id)).toBe(true);
    for (const id of Object.keys(maximal.records.reaction)) expect(result.included.has(id)).toBe(true);
    expect(result.included.has('ast_max-grignard-scheme')).toBe(true); // attaches to rxn_max-grignard-propanone
    for (const id of Object.keys(maximal.records.topic_mapping)) expect(result.included.has(id)).toBe(false);
    for (const id of Object.keys(maximal.records.navigator_anchor)) expect(result.included.has(id)).toBe(false);
  });

  it('curriculum: every layer 1+3 record, plus the reaction topic_mapping/exam_relevance map (and what THAT needs to resolve)', () => {
    const result = selectScope(maximal, { scope: 'curriculum', includeDependencies: false, assets: 'none' });
    for (const id of Object.keys(maximal.records.topic)) expect(result.included.has(id)).toBe(true);
    for (const id of Object.keys(maximal.records.exam)) expect(result.included.has(id)).toBe(true);
    expect(result.included.has('rxn_max-grignard-propanone')).toBe(true); // topic_mapping.target and exam_relevance.target
    // presentation is never pulled in by a curriculum scope (chemistry/curriculum never reference it, INV-29 direction)
    for (const id of Object.keys(maximal.records.navigator_anchor)) expect(result.included.has(id)).toBe(false);
  });

  it('presentation: every layer 5 record, plus the chemistry/curriculum/attachments it decorates', () => {
    const result = selectScope(maximal, { scope: 'presentation', includeDependencies: false, assets: 'none' });
    for (const id of Object.keys(maximal.records.navigator_anchor)) expect(result.included.has(id)).toBe(true);
    expect(result.included.has('cls_max-ketones')).toBe(true); // navigator_anchor.target
    expect(result.included.has('rxn_max-grignard-propanone')).toBe(true); // reaction_scheme.reactionId
    expect(result.included.has('ast_max-grignard-scheme')).toBe(true); // reaction_scheme.preferAssetId
    expect(result.included.has('spc_max-diethyl-ether')).toBe(true); // entity_display.target
    expect(result.included.has('exm_max-jee-advanced')).toBe(true); // view_preset.filters.examId
    expect(result.included.has('top_max-grignard')).toBe(true); // view_preset.filters.topicIds
  });
});

describe('selectScope — subset', () => {
  const oneReaction: ExportOptions = { scope: 'subset', subset: [{ kind: 'reaction', id: 'rxn_max-grignard-propanone' }], includeDependencies: false, assets: 'none' };

  it('without includeDependencies: exactly the subset, and every reference leaving it is reported, none silently dropped or kept', () => {
    const result = selectScope(maximal, oneReaction);
    expect(result.included).toEqual(new Set(['rxn_max-grignard-propanone']));
    expect(result.missingReferences.length).toBeGreaterThan(0);
    expect(result.missingReferences.every((m) => m.from.id === 'rxn_max-grignard-propanone')).toBe(true);
  });

  it('with includeDependencies: the closure resolves every reference the reaction makes, so nothing is missing', () => {
    const result = selectScope(maximal, { ...oneReaction, includeDependencies: true });
    expect(result.included.has('rxn_max-grignard-propanone')).toBe(true);
    expect(result.included.size).toBeGreaterThan(1);
    expect(result.missingReferences).toEqual([]);
  });

  it('an empty subset selects nothing and reports nothing missing', () => {
    const result = selectScope(maximal, { scope: 'subset', includeDependencies: false, assets: 'none' });
    expect(result.included.size).toBe(0);
    expect(result.missingReferences).toEqual([]);
  });

  it('with includeDependencies: a reference the closure itself walks into and finds gone is reported too, never a crash or a silent gap', () => {
    const broken = withoutRecord(maximal, 'species', 'spc_max-propanone'); // a reactant of rxn_max-grignard-propanone
    const result = selectScope(broken, { ...oneReaction, includeDependencies: true });
    expect(result.missingReferences).toEqual(expect.arrayContaining([expect.objectContaining({ targetKind: 'species', targetId: 'spc_max-propanone' })]));
  });
});
