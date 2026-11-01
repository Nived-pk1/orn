// @vitest-environment jsdom
/**
 * The Named reactions view (step 7.4 D): the list with its find box and exam scope, the "Not written yet" line in Studio only, a page with its
 * family links, the conditions box apart from the cards, the examples folded, the mechanism line, caveats and "In chapters", a saved record that
 * is gone, and 30 at a time.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyRecordTables, type AnyRecord, type CanonicalState } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { examVersion, topic, topicMapping } from '@/test-support/curriculum-kit';
import { concept, sp, species } from '@/test-support/demo/kit';
import { reaction } from '@/test-support/demo/reaction-kit';
import { contextOf } from '@/test-support/graph-state';
import { caveatOn, mechanismRecord, mechStep, mechVariant, namedReaction, nrxRef } from '@/test-support/named-kit';
import { createActiveExamStore, createInspectorStore, createPageListStore } from '@/ui/state';
import type { NamedPorts } from './contracts';
import { NamedView } from './named-view';

afterEach(cleanup);

function stateOf(...records: readonly AnyRecord[]): CanonicalState {
  const tables = emptyRecordTables() as unknown as Record<string, Record<string, AnyRecord>>;
  for (const record of records) (tables[record.kind] as Record<string, AnyRecord>)[record.id] = record;
  return { meta: demoState().meta, records: tables as unknown as CanonicalState['records'] };
}

const rxn = (slug: string, name: string, extra: Partial<Parameters<typeof reaction>[0]> = {}) =>
  reaction({ slug, name, scope: 'specific', participants: [{ ref: sp('subs'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('prod') }] }], ...extra });

const fc = namedReaction('fc', 'Friedel–Crafts reaction', { aliases: ['Friedel Crafts'] });
const fca = namedReaction('fca', 'Friedel–Crafts acylation', { parents: ['fc'], aliases: ['FC acylation', 'Acylation', 'Third alias'], summary: 'An acyl group adds to an arene.', typicalConditions: 'AlCl3, dry', concepts: ['eas'], prerequisites: ['acyl'] });
const lonely = namedReaction('lone', 'Lonely reaction');
const mech = mechanismRecord('m1', 'Acylation mechanism', [mechVariant('v1', 'Base', [mechStep('s1')])]);
const general = rxn('gen', 'General acylation', { named: ['fca'], scope: 'generic', mechanisms: ['m1'] });
const example = rxn('ex', 'Benzene acylation', { named: ['fca'], instanceOf: 'gen' });
const base: AnyRecord[] = [
  fc, fca, lonely, mech, general, example,
  concept('eas', 'Electrophilic aromatic substitution', 'reaction_type'), concept('acyl', 'Acyl chlorides', 'reaction_type'),
  caveatOn('c1', 'Acylation caveat', [nrxRef('fca')]),
  species('subs', 'Substrate'), species('prod', 'Product'),
  topic('subj', 'Organic', { kind: 'subject', order: 1 }), topic('chap-a', 'Alpha chapter', { kind: 'chapter', parent: 'subj', order: 1 }),
  topicMapping('m1', 'chap-a', nrxRef('fca')),
];

function show(state: CanonicalState, saved: Parameters<typeof createPageListStore>[0] = {}, extra: Partial<NamedPorts> = {}) {
  const context = contextOf(state);
  const named = createPageListStore(saved);
  const exam = createActiveExamStore();
  const inspector = createInspectorStore();
  const calls: string[] = [];
  const ports: NamedPorts = {
    store: { getState: () => state, subscribe: () => () => undefined },
    indexes: { current: () => context.indexes },
    ui: { named, exam, inspector },
    renderCard: (args) => (
      <div data-card={args.reactionId} data-examples={(args.examples ?? []).join(',')}>
        {args.reactionId}
      </div>
    ),
    renderRichText: (source) => <p>{source}</p>,
    renderPictures: () => null,
    select: (ref) => void calls.push(`select ${ref.id}`),
    selectReaction: (id) => void calls.push(`reaction ${id}`),
    showInReactions: (id) => void calls.push(`reactions ${id}`),
    openMechanism: (id) => void calls.push(`mechanism ${id}`),
    openChapter: (id) => void calls.push(`chapter ${id}`),
    timers: { after: () => () => undefined },
    log: () => undefined,
    ...extra,
  };
  render(<NamedView ports={ports} />);
  return { named, exam, calls };
}

describe('the list', () => {
  it('lists written records by name with aliases (two), parent and counts; Study leaves the empty one out', () => {
    show(stateOf(...base));
    expect(screen.getByRole('heading', { level: 2, name: 'Named reactions' })).toBeTruthy();
    const rows = within(screen.getByRole('list', { name: 'Named reactions' })).getAllByRole('listitem').filter((li) => li.hasAttribute('data-named-id'));
    expect(rows.map((r) => r.querySelector('button')?.textContent)).toEqual(['Friedel–Crafts acylation', 'Friedel–Crafts reaction']);
    expect(rows[0]?.textContent).toContain('also called FC acylation, Acylation');
    expect(rows[0]?.textContent).not.toContain('Third alias');
    expect(rows[0]?.textContent).toContain('Part of Friedel–Crafts reaction');
    expect(rows[0]?.textContent).toContain('2 reactions · has a mechanism');
    expect(screen.queryByText(/Not written yet/)).toBeNull();
    expect(screen.getByText('2 of 3 named reactions')).toBeTruthy();
  });

  it('Studio lists the empty one at the end as "Not written yet"', () => {
    show(stateOf(...base), {}, { edit: () => undefined });
    expect(screen.getByText('Not written yet: Lonely reaction')).toBeTruthy();
  });

  it('the find box matches an alias; "Clear all filters" empties it', () => {
    const { named } = show(stateOf(...base));
    fireEvent.change(screen.getByLabelText('Find by name'), { target: { value: 'fc acyl' } });
    expect(named.getState().text).toBe('fc acyl');
    expect(screen.getByText('1 of 3 named reactions')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(named.getState().text).toBe('');
  });

  it('under an exam scope "Only <exam version>" hides what has no reaction inside', () => {
    const state = stateOf(...base, topicMapping('mx', 'chap-x', { kind: 'reaction', id: 'rxn_gen' } as never), topicMapping('mx2', 'chap-x', { kind: 'reaction', id: 'rxn_ex' } as never), examVersion('v1', 'jee', [{ topic: 'chap-a', coverage: 'included' }]));
    const { exam } = show(state);
    act(() => exam.getState().setActive({ examId: 'exm_jee', examVersionId: 'exv_v1' } as never));
    expect(screen.getByLabelText(/^Only /)).toBeTruthy();
  });

  it('says so in words when nothing matches and when there are none', () => {
    show(stateOf(...base), { text: 'zzz' });
    expect(screen.getByText('No named reaction matches these filters.')).toBeTruthy();
    cleanup();
    show(stateOf(species('subs', 'Substrate')));
    expect(screen.getByText('There are no named reactions in the data yet.')).toBeTruthy();
  });

  it('draws 30 at a time with a notice', () => {
    const many = Array.from({ length: 35 }, (_, i) => namedReaction(`n${String(i).padStart(2, '0')}`, `Reaction ${String(i).padStart(2, '0')}`, { summary: 'Text.' }));
    show(stateOf(...many));
    expect(within(screen.getByRole('list', { name: 'Named reactions' })).getAllByRole('listitem').filter((li) => li.hasAttribute('data-named-id'))).toHaveLength(30);
    expect(screen.getByText('Showing 30 of 35 named reactions')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show 30 more' }));
    expect(screen.getAllByRole('listitem').filter((li) => li.hasAttribute('data-named-id'))).toHaveLength(35);
  });
});

describe('a page', () => {
  it('has the name, aliases, summary, family links, concepts, the conditions box apart from the cards, and the examples folded', () => {
    const { named, calls } = show(stateOf(...base), { openId: 'nrx_fca' });
    expect(screen.getByRole('heading', { level: 2, name: 'Friedel–Crafts acylation' })).toBeTruthy();
    expect(screen.getByText('also called FC acylation, Acylation, Third alias')).toBeTruthy();
    expect(screen.getByText('An acyl group adds to an arene.')).toBeTruthy();
    const box = screen.getByRole('complementary', { name: 'Typical conditions' });
    expect(box.textContent).toContain('AlCl3, dry');
    expect(box.querySelector('[data-card]')).toBeNull();
    const cards = screen.getAllByText(/^rxn_/).map((n) => n.getAttribute('data-card'));
    expect(cards).toEqual(['rxn_gen']);
    expect(screen.getByText('rxn_gen').getAttribute('data-examples')).toBe('rxn_ex');
    fireEvent.click(screen.getByRole('button', { name: 'Electrophilic aromatic substitution' }));
    fireEvent.click(screen.getByRole('button', { name: 'Acyl chlorides' }));
    expect(calls).toEqual(['select cpt_eas', 'select cpt_acyl']);
    fireEvent.click(screen.getByRole('button', { name: 'Friedel–Crafts reaction' }));
    expect(named.getState().openId).toBe('nrx_fc');
  });

  it('a parent lists its kinds; "Show these reactions in Reactions", the mechanism line, caveats and chapters are links', () => {
    const { calls } = show(stateOf(...base), { openId: 'nrx_fc' });
    expect(screen.getByText(/^Kinds:/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show these reactions in Reactions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Acylation mechanism' }));
    expect(calls).toEqual(['reactions nrx_fc', 'mechanism mec_m1']);
  });

  it('shows caveats, chapters and a back button; Edit only when the app gives it', () => {
    const { named, calls } = show(stateOf(...base), { openId: 'nrx_fca' });
    expect(screen.getByText('Acylation caveat')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Alpha chapter' }));
    expect(calls).toEqual(['chapter top_chap-a']);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All named reactions' }));
    expect(named.getState().openId).toBeNull();
    cleanup();
    show(stateOf(...base), { openId: 'nrx_fca' }, { edit: () => undefined });
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('a record with no reaction says so and has no "Show these reactions" button', () => {
    show(stateOf(...base), { openId: 'nrx_lone' });
    expect(screen.getByText('No reaction is written for this named reaction yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show these reactions in Reactions' })).toBeNull();
  });

  it('a saved record that is gone is dropped and said once', () => {
    show(stateOf(...base), { openId: 'nrx_gone' });
    expect(screen.getByRole('status').textContent).toContain('no longer in the data');
    expect(screen.getByRole('heading', { level: 2, name: 'Named reactions' })).toBeTruthy();
  });
});
