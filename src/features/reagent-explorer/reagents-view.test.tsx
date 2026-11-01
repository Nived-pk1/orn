// @vitest-environment jsdom
/**
 * The Reagents view (step 7.3c D1-D3, D5): the list with its filters, a reagent page with one section per profile, the conditions box beside
 * the cards and never in them, "How it is used here", 30 at a time, exam scope, a saved reagent that is gone.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyRecordTables, type AnyRecord, type CanonicalState } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { examVersion, topic, topicMapping } from '@/test-support/curriculum-kit';
import { conditions, ident, reagent, rg, sp, species } from '@/test-support/demo/kit';
import { reaction } from '@/test-support/demo/reaction-kit';
import { contextOf } from '@/test-support/graph-state';
import { createActiveExamStore, createInspectorStore, createReagentsStore } from '@/ui/state';
import type { ReagentsPorts } from './contracts';
import { ReagentsView } from './reagents-view';

afterEach(cleanup);

function stateOf(...records: readonly AnyRecord[]): CanonicalState {
  const tables = emptyRecordTables() as unknown as Record<string, Record<string, AnyRecord>>;
  for (const record of records) (tables[record.kind] as Record<string, AnyRecord>)[record.id] = record;
  return { meta: demoState().meta, records: tables as unknown as CanonicalState['records'] };
}

const profile = (body: string, label: string, aliases: string[], medium?: 'basic' | 'acidic') => ({ id: ident<never>('rpf', body), label, aliases, parameters: conditions(medium === undefined ? {} : { medium }) });
const rxn = (slug: string, name: string, participants: Parameters<typeof reaction>[0]['participants']) => reaction({ slug, name, scope: 'specific', participants, outcomes: [{ sel: 'major', products: [{ ref: sp('prod') }] }] });
const withKoh = (profileBody: string | undefined, phase?: 'aq' | 'alc') => [{ ref: sp('subs'), role: 'reactant' as const }, { ref: rg('koh'), role: 'reagent' as const, ...(profileBody === undefined ? {} : { profile: profileBody }), ...(phase === undefined ? {} : { phase }) }];

const koh = reagent('koh', 'Potassium hydroxide', { species: 'koh', formulaText: 'KOH', families: ['base', 'nucleophile'], profiles: [profile('aq', 'Aqueous KOH', ['aq. KOH'], 'basic'), profile('alc', 'Alcoholic KOH', ['alc. KOH'], 'basic'), profile('idle', 'Molten KOH', [])] });
const pcc = reagent('pcc', 'PCC', { families: ['oxidant'] });
const lindlar = reagent('lindlar', 'Lindlar catalyst', { families: ['catalyst'], components: [{ ref: rg('pcc'), role: 'support' }, { ref: sp('koh'), role: 'poison', amountText: 'a little' }] });
const base: AnyRecord[] = [koh, pcc, lindlar, species('koh', 'Potassium hydroxide (species)'), species('prod', 'Product'), species('subs', 'Substrate'), rxn('r-aq', 'Aqueous elimination', withKoh('aq', 'aq')), rxn('r-alc', 'Alcoholic elimination', withKoh('alc', 'alc')), rxn('r-bare', 'Bare use', withKoh(undefined)), rxn('r-pcc', 'Oxidation', [{ ref: sp('subs'), role: 'reactant' }, { ref: rg('pcc'), role: 'reagent' }])];

/** Every KOH reaction maps to a chapter an exam version excludes, so it is outside that scope. */
const excludedKoh = ['r-aq', 'r-alc', 'r-bare'].map((slug, i) => topicMapping(`mx${i}`, 'chap-x', { kind: 'reaction', id: `rxn_${slug}` } as never));

function show(state: CanonicalState, saved: Parameters<typeof createReagentsStore>[0] = {}, extra: Partial<ReagentsPorts> = {}) {
  const context = contextOf(state);
  const reagents = createReagentsStore(saved);
  const exam = createActiveExamStore();
  const inspector = createInspectorStore();
  const calls: string[] = [];
  const ports: ReagentsPorts = {
    store: { getState: () => state, subscribe: () => () => undefined },
    indexes: { current: () => context.indexes },
    ui: { reagents, exam, inspector },
    renderCard: (args) => (
      <div data-card={args.reactionId} data-arrow-text="Arrow text of the reaction">
        {args.reactionId}
      </div>
    ),
    nameOf: (ref) => {
      const one = (state.records[ref.kind] as Record<string, { name?: string; names?: { canonical: string } }>)[ref.id];
      return one?.names?.canonical ?? one?.name ?? ref.id;
    },
    conditionPhrases: (parameters) => (parameters.medium === undefined ? [] : [`${parameters.medium} medium`]),
    renderRichText: (source) => <p>{source}</p>,
    select: (ref) => void calls.push(`select ${ref.id}`),
    selectReaction: (id) => void calls.push(`reaction ${id}`),
    showInReactions: (id) => void calls.push(`reactions ${id}`),
    timers: { after: () => () => undefined },
    log: () => undefined,
    ...extra,
  };
  render(<ReagentsView ports={ports} />);
  return { reagents, exam, calls };
}

describe('the list (D1)', () => {
  it('lists reagents by name with formula, backing, families and counts in words', () => {
    show(stateOf(...base));
    expect(screen.getByRole('heading', { level: 2, name: 'Reagents' })).toBeTruthy();
    expect(screen.getByText('3 reagents')).toBeTruthy();
    const rows = within(screen.getByRole('list', { name: 'Reagents' })).getAllByRole('listitem').filter((li) => li.hasAttribute('data-reagent-id'));
    expect(rows.map((r) => r.querySelector('button')?.textContent)).toEqual(['Lindlar catalyst', 'PCC', 'Potassium hydroxide']);
    expect(rows[0]?.textContent).toContain('Mixture of PCC, Potassium hydroxide (species)');
    expect(rows[2]?.textContent).toContain('Species: Potassium hydroxide (species)');
    expect(rows[2]?.textContent).toContain('3 reactions · 3 profiles');
  });

  it('the name box finds a reagent by a profile alias; a family chip narrows with counts; "Clear all filters" empties them', () => {
    const { reagents } = show(stateOf(...base));
    fireEvent.change(screen.getByLabelText('Find by name'), { target: { value: 'alc. koh' } });
    expect(reagents.getState().text).toBe('alc. koh');
    expect(screen.getByText('1 of 3 reagents')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(reagents.getState().text).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'oxidant 1' }));
    expect(reagents.getState().families).toEqual(['oxidant']);
    expect(screen.queryByRole('button', { name: 'Potassium hydroxide' })).toBeNull();
  });

  it('says so in words when nothing matches, and when there are no reagents', () => {
    show(stateOf(...base), { text: 'zzz' });
    expect(screen.getByText('No reagent matches these filters.')).toBeTruthy();
    cleanup();
    show(stateOf(species('koh', 'KOH')));
    expect(screen.getByText('There are no reagents in the data yet.')).toBeTruthy();
  });

  it('shows 30 at a time and says so', () => {
    const many = Array.from({ length: 35 }, (_, i) => reagent(`many${String(i).padStart(2, '0')}`, `Many ${String(i).padStart(2, '0')}`, { families: ['solvent'] }));
    show(stateOf(...many));
    expect(within(screen.getByRole('list', { name: 'Reagents' })).getAllByRole('listitem').filter((li) => li.hasAttribute('data-reagent-id'))).toHaveLength(30);
    expect(screen.getByText('Showing 30 of 35 reagents')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show 30 more' }));
    expect(screen.getAllByRole('listitem').filter((li) => li.hasAttribute('data-reagent-id'))).toHaveLength(35);
  });

  it('"Only <exam version>" appears with a scope and keeps the reagents with an in-scope reaction', () => {
    const state = stateOf(...base, topic('subj', 'Organic', { kind: 'subject', order: 1 }), topic('chap', 'Chapter', { kind: 'chapter', parent: 'subj', order: 1 }), topic('chap-x', 'Other chapter', { kind: 'chapter', parent: 'subj', order: 2 }), topicMapping('m1', 'chap', { kind: 'reaction', id: 'rxn_r-pcc' } as never), ...excludedKoh, examVersion('v1', 'jee', [{ topic: 'chap', coverage: 'included' }, { topic: 'chap-x', coverage: 'excluded' }]));
    const { exam, reagents } = show(state);
    expect(screen.queryByLabelText(/^Only /)).toBeNull();
    act(() => exam.getState().setActive({ examId: 'exm_jee', examVersionId: 'exv_v1' } as never));
    fireEvent.click(screen.getByLabelText(/^Only /));
    expect(reagents.getState().onlyInScope).toBe(true);
    expect(screen.getByText('1 of 3 reagents')).toBeTruthy();
  });
});

describe('a reagent page (D2, D3)', () => {
  it('has one section per profile in order, then "Used without a profile"; the conditions box is apart from the cards', () => {
    const { calls } = show(stateOf(...base), { reagentId: 'rgt_koh' });
    expect(screen.getByRole('heading', { level: 2, name: 'Potassium hydroxide' })).toBeTruthy();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Aqueous KOH (1 reaction)', 'Alcoholic KOH (1 reaction)', 'Molten KOH (0 reactions)', 'Used without a profile (1 reaction)']);
    const aq = screen.getByRole('region', { name: 'Aqueous KOH' });
    const box = within(aq).getByRole('complementary', { name: 'Usual conditions of this profile' });
    expect(box.textContent).toContain('basic medium');
    expect(box.querySelector('[data-card]')).toBeNull();
    const card = aq.querySelector('[data-card="rxn_r-aq"]') as HTMLElement;
    expect(card.getAttribute('data-arrow-text')).toBe('Arrow text of the reaction');
    expect(card.textContent).not.toContain('basic medium');
    expect(aq.textContent).toContain('also called aq. KOH');
    expect(aq.textContent).toContain('How it is used here: reagent · aqueous');
    fireEvent.click(screen.getByRole('button', { name: 'Show these reactions in Reactions' }));
    expect(calls).toEqual(['reactions rgt_koh']);
  });

  it('a profile no reaction uses keeps its conditions and says so; a profile-less section has no conditions box', () => {
    show(stateOf(...base), { reagentId: 'rgt_koh' });
    const idle = screen.getByRole('region', { name: 'Molten KOH' });
    expect(within(idle).getByRole('complementary', { name: 'Usual conditions of this profile' })).toBeTruthy();
    expect(within(idle).getByText('No reaction uses this profile yet.')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Used without a profile' })).queryByRole('complementary')).toBeNull();
  });

  it('a mixture lists its parts; "Part of" opens the other reagent; Edit is there only when the app gives it', () => {
    const { reagents } = show(stateOf(...base), { reagentId: 'rgt_pcc' });
    expect(screen.getByText('Part of:')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lindlar catalyst' }));
    expect(reagents.getState().reagentId).toBe('rgt_lindlar');
    expect(screen.getByText(/Made of:/).parentElement?.textContent).toContain('(support)');
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    cleanup();
    const edited: string[] = [];
    show(stateOf(...base), { reagentId: 'rgt_pcc' }, { edit: (id) => void edited.push(id) });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(edited).toEqual(['rgt_pcc']);
  });

  it('"All reagents" goes back to the list', () => {
    const { reagents } = show(stateOf(...base), { reagentId: 'rgt_koh' });
    fireEvent.click(screen.getByRole('button', { name: 'All reagents' }));
    expect(reagents.getState().reagentId).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Reagents' })).toBeTruthy();
  });

  it('a saved reagent that is gone is dropped and said once', () => {
    show(stateOf(...base), { reagentId: 'rgt_gone' });
    expect(screen.getByRole('status').textContent).toContain('no longer in the data');
    expect(screen.getByRole('heading', { level: 2, name: 'Reagents' })).toBeTruthy();
  });

  it('30 cards a section, with the count and a button for more', () => {
    const many = Array.from({ length: 33 }, (_, i) => rxn(`m${String(i).padStart(2, '0')}`, `Many ${String(i).padStart(2, '0')}`, withKoh('aq')));
    show(stateOf(koh, species('koh', 'KOH'), species('prod', 'P'), species('subs', 'S'), ...many), { reagentId: 'rgt_koh' });
    const aq = screen.getByRole('region', { name: 'Aqueous KOH' });
    expect(aq.querySelectorAll('[data-card]')).toHaveLength(30);
    expect(within(aq).getByText('Showing 30 of 33 reactions')).toBeTruthy();
    fireEvent.click(within(aq).getByRole('button', { name: 'Show 30 more' }));
    expect(aq.querySelectorAll('[data-card]')).toHaveLength(33);
  });

  it('under an exam scope the outside reactions are marked, and "Only <exam>" hides them with a notice', () => {
    const state = stateOf(...base, topic('subj', 'Organic', { kind: 'subject', order: 1 }), topic('chap', 'Chapter', { kind: 'chapter', parent: 'subj', order: 1 }), topic('chap-x', 'Other chapter', { kind: 'chapter', parent: 'subj', order: 2 }), topicMapping('m1', 'chap', { kind: 'reaction', id: 'rxn_r-aq' } as never), topicMapping('m2', 'chap-x', { kind: 'reaction', id: 'rxn_r-alc' } as never), examVersion('v1', 'jee', [{ topic: 'chap', coverage: 'included' }, { topic: 'chap-x', coverage: 'excluded' }]));
    const cards: string[] = [];
    const { exam, reagents } = show(state, { reagentId: 'rgt_koh' }, { renderCard: (args) => (cards.push(`${args.reactionId}:${args.outside ?? ''}`), <div data-card={args.reactionId} />) });
    act(() => exam.getState().setActive({ examId: 'exm_jee', examVersionId: 'exv_v1' } as never));
    expect(cards.some((c) => c.startsWith('rxn_r-alc:outside'))).toBe(true);
    act(() => reagents.getState().setOnlyInScope(true));
    expect(screen.getByRole('region', { name: 'Alcoholic KOH' }).querySelector('[data-card]')).toBeNull();
    expect(screen.getByText('1 reaction is left out by the exam scope.', { exact: false })).toBeTruthy();
  });
});
