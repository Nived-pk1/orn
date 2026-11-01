// @vitest-environment jsdom
/**
 * The Mechanisms view (step 7.4 E): the list (classes as words, "n reactions · n steps", find by alias), the "Not written yet" line in Studio only, a
 * page with one pathway (no variant heading) or several (a section each), the numbered steps with kinds, roles, "slow step" and "reversible"
 * marks, the rate law, species drawn or named, the reactions that use it, a saved record that is gone, and no curved-arrow text anywhere.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyRecordTables, type AnyRecord, type CanonicalState } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { concept, sp, species } from '@/test-support/demo/kit';
import { reaction } from '@/test-support/demo/reaction-kit';
import { contextOf } from '@/test-support/graph-state';
import { caveatOn, mecRef, mechanismRecord, mechStep, mechVariant } from '@/test-support/named-kit';
import { createActiveExamStore, createInspectorStore, createPageListStore } from '@/ui/state';
import type { MechanismPorts } from './contracts';
import { MechanismsView } from './mechanisms-view';

afterEach(cleanup);

function stateOf(...records: readonly AnyRecord[]): CanonicalState {
  const tables = emptyRecordTables() as unknown as Record<string, Record<string, AnyRecord>>;
  for (const record of records) (tables[record.kind] as Record<string, AnyRecord>)[record.id] = record;
  return { meta: demoState().meta, records: tables as unknown as CanonicalState['records'] };
}

const rxn = (slug: string, name: string, extra: Partial<Parameters<typeof reaction>[0]> = {}) =>
  reaction({ slug, name, scope: 'specific', participants: [{ ref: sp('subs'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('prod') }] }], ...extra });

const aldol = mechanismRecord(
  'aldol',
  'Aldol addition',
  [
    mechVariant('base', 'Base-catalysed', [
      mechStep('b1', { title: 'Enolate forms', kinds: ['proton_transfer'], description: 'Hydroxide takes a proton.', species: [{ role: 'reagent', label: 'Hydroxide' }, { role: 'intermediate', label: 'Enolate', structure: { format: 'smiles', value: 'C=C[O-]' } }], reversible: true }),
      mechStep('b2', { kinds: ['nucleophilic_attack', 'bond_formation'], species: [{ role: 'transition_state', label: 'TS' }], rds: true, event: 'New stereocentre', note: 'A note.' }),
    ], { applicability: 'In dilute alkali.', rateLaw: 'rate = k[enolate][aldehyde]' }),
    mechVariant('acid', 'Acid-catalysed', [mechStep('a1', { title: 'Protonation' })]),
  ],
  { aliases: ['Aldol'], classes: ['an'], summary: 'Two carbonyls join.', concepts: ['an'] },
);
const sn2 = mechanismRecord('sn2', 'SN2 substitution', [mechVariant('vc', 'Concerted', [mechStep('s1', { title: 'Backside attack', kinds: ['nucleophilic_attack'] })])], { summary: 'One step.' });
const blank = mechanismRecord('blank', 'Blank mechanism', []);
const general = rxn('gen', 'General aldol', { scope: 'generic', mechanisms: ['aldol'] });
const example = rxn('ex', 'Ethanal aldol', { instanceOf: 'gen', mechanisms: ['aldol'] });
const base: AnyRecord[] = [aldol, sn2, blank, general, example, concept('an', 'Nucleophilic addition', 'mechanism_class'), caveatOn('c1', 'Aldol caveat', [mecRef('aldol')]), species('subs', 'Substrate'), species('prod', 'Product')];

function show(state: CanonicalState, saved: Parameters<typeof createPageListStore>[0] = {}, extra: Partial<MechanismPorts> = {}) {
  const context = contextOf(state);
  const mechanisms = createPageListStore(saved);
  const exam = createActiveExamStore();
  const inspector = createInspectorStore();
  const calls: string[] = [];
  const ports: MechanismPorts = {
    store: { getState: () => state, subscribe: () => () => undefined },
    indexes: { current: () => context.indexes },
    ui: { mechanisms, exam, inspector },
    renderCard: (args) => (
      <div data-card={args.reactionId} data-examples={(args.examples ?? []).join(',')}>
        {args.reactionId}
      </div>
    ),
    renderRichText: (source) => <p>{source}</p>,
    renderPictures: () => null,
    renderStructure: (structure, name) => <span data-drawing={name}>{structure.value}</span>,
    select: (ref) => void calls.push(`select ${ref.id}`),
    selectReaction: (id) => void calls.push(`reaction ${id}`),
    openChapter: (id) => void calls.push(`chapter ${id}`),
    timers: { after: () => () => undefined },
    log: () => undefined,
    ...extra,
  };
  render(<MechanismsView ports={ports} />);
  return { mechanisms, calls };
}

describe('the list', () => {
  it('lists written mechanisms with classes as words and "n reactions · n steps"; Study leaves the empty one out', () => {
    show(stateOf(...base));
    expect(screen.getByRole('heading', { level: 2, name: 'Mechanisms' })).toBeTruthy();
    const rows = within(screen.getByRole('list', { name: 'Mechanisms' })).getAllByRole('listitem').filter((li) => li.hasAttribute('data-mechanism-id'));
    expect(rows.map((r) => r.querySelector('button')?.textContent)).toEqual(['Aldol addition', 'SN2 substitution']);
    expect(rows[0]?.textContent).toContain('Nucleophilic addition');
    expect(rows[0]?.textContent).toContain('2 reactions · 3 steps');
    expect(rows[0]?.textContent).toContain('also called Aldol');
    expect(rows[1]?.textContent).toContain('0 reactions · 1 step');
    expect(screen.queryByText(/Not written yet/)).toBeNull();
  });

  it('Studio lists the empty one at the end; the find box matches an alias', () => {
    const { mechanisms } = show(stateOf(...base), {}, { edit: () => undefined });
    expect(screen.getByText('Not written yet: Blank mechanism')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Find by name'), { target: { value: 'aldol' } });
    expect(mechanisms.getState().text).toBe('aldol');
    expect(screen.getByText('1 of 3 mechanisms')).toBeTruthy();
  });
});

describe('a page', () => {
  it('two pathways: a section each, numbered steps with kinds, marks, species roles, rate law', () => {
    show(stateOf(...base), { openId: 'mec_aldol' });
    expect(screen.getByRole('heading', { level: 2, name: 'Aldol addition' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Base-catalysed' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Acid-catalysed' })).toBeTruthy();
    const base1 = screen.getByRole('region', { name: 'Base-catalysed' });
    expect(within(base1).getByText('In dilute alkali.')).toBeTruthy();
    const steps = within(base1).getAllByRole('listitem').filter((li) => li.hasAttribute('data-step'));
    expect(steps).toHaveLength(2);
    expect(within(steps[0] as HTMLElement).getByRole('heading', { level: 4 }).textContent).toBe('Step 1 · Enolate forms');
    expect(steps[0]?.textContent).toContain('proton transfer');
    expect(steps[0]?.textContent).toContain('⇌ reversible');
    expect(steps[0]?.textContent).not.toContain('slow step');
    expect(steps[0]?.textContent).toContain('Hydroxide');
    expect(steps[0]?.textContent).toContain('intermediate');
    expect(steps[0]?.querySelector('[data-drawing="Enolate"]')?.textContent).toBe('C=C[O-]');
    expect(within(steps[1] as HTMLElement).getByRole('heading', { level: 4 }).textContent).toBe('Step 2 · nucleophilic attack, bond formation');
    expect(steps[1]?.textContent).toContain('slow step');
    expect(steps[1]?.textContent).toContain('transition state');
    expect(steps[1]?.textContent).toContain('Stereochemistry: New stereocentre');
    expect(base1.querySelector('[data-rate-law]')?.textContent).toBe('Rate law: rate = k[enolate][aldehyde]');
  });

  it('one pathway: no variant heading; the reactions use their examples folded; the caveats; no curved-arrow text', () => {
    show(stateOf(...base), { openId: 'mec_sn2' });
    expect(screen.queryByRole('heading', { level: 3, name: 'Concerted' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Steps' })).toBeTruthy();
    cleanup();
    show(stateOf(...base), { openId: 'mec_aldol' });
    expect(screen.getByText('rxn_gen').getAttribute('data-examples')).toBe('rxn_ex');
    expect(screen.getByText('Aldol caveat')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/curved arrow|arrow pushing|coming later|Phase 8/i);
  });

  it('classes and concepts are links that open in the inspector; back and Edit', () => {
    const { mechanisms, calls } = show(stateOf(...base), { openId: 'mec_aldol' }, { edit: () => undefined });
    fireEvent.click(screen.getAllByRole('button', { name: 'Nucleophilic addition' })[0] as HTMLElement);
    expect(calls).toEqual(['select cpt_an']);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All mechanisms' }));
    expect(mechanisms.getState().openId).toBeNull();
  });

  it('a mechanism with no step says so', () => {
    show(stateOf(...base), { openId: 'mec_blank' });
    expect(screen.getByText('No step is written for this mechanism yet.')).toBeTruthy();
  });

  it('a saved record that is gone is dropped and said once', () => {
    show(stateOf(...base), { openId: 'mec_gone' });
    expect(screen.getByRole('status').textContent).toContain('no longer in the data');
  });
});
