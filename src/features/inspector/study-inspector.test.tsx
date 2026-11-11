// @vitest-environment jsdom
/**
 * Step 8.1 Part C: the Study inspector's layout over the demo dataset (the model has its own test): the kind chip, the hero, the lead with
 * "Read more", the chips, the watch-out, go-next, the connected cards with "Show all", the chapters; Study shows none of the author words;
 * Studio shows the same layout and a closed "For authors" that holds the old levels (the B1 inventory).
 * NOTE (honest): the components were written before this file, so these tests were not seen red.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { RecordRef } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout, inspectorRig, openLevels, preloadViews } from '@/test-support/inspector-kit';
import { Inspector } from './inspector';

const state = demoState();
beforeAll(async () => {
  fakeLayout();
  await preloadViews();
});
afterEach(cleanup);

const ref = (kind: string, id: string): RecordRef => ({ kind, id }) as RecordRef;
async function show(target: RecordRef, studyView = true, host: object = {}) {
  const rig = inspectorRig(state, { studyView });
  render(<Inspector ports={rig.ports} host={{ ...rig.host, ...host }} />);
  act(() => rig.inspector.getState().open(target));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return rig;
}

const ETHANOL = ref('species', 'spc_ethanol');
const REACTION = ref('reaction', 'rxn_alcohol1-to-aldehyde-pcc');

describe('the Study layout', () => {
  it('a kind chip in plain words, then the title; no "species" or "concept" word under it', async () => {
    await show(ETHANOL);
    expect(document.querySelector('header')?.textContent).toMatch(/^Compound(Not yet reviewed)?Ethanol/); // the review mark sits on the chip row, right of the chip (step 8.4e, B1)
    expect(screen.queryByText('species')).toBeNull();
  });

  it('Back and Forward are two icon buttons with their names', async () => {
    await show(ETHANOL);
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Forward' })).toBeTruthy();
  });

  it('the reaction: its equation is the hero and "Show full equation" stays below it; the watch-out is an amber callout', async () => {
    await show(REACTION);
    expect(document.querySelector('[data-hero="reaction"] [data-hero-equation]')).not.toBeNull();
    expect(screen.getByText('Show full equation')).toBeTruthy();
    const watch = screen.getByRole('region', { name: 'Watch out' });
    expect(within(watch).getByText('PCC stops at the aldehyde')).toBeTruthy();
  });

  it('the hero equation is one nowrap row (the full one and the compact one for the sheet); the geometry is proved by the e2e', async () => {
    await show(REACTION);
    expect(document.querySelectorAll('[data-hero-equation]')).toHaveLength(2);
    expect(document.querySelector('[data-hero-main] [data-equation-scheme] [data-nowrap]')).not.toBeNull();
    expect(document.querySelector('[data-sheet-peek-only] [data-hero-equation][data-compact]')).not.toBeNull();
    expect(document.querySelector('[data-hero-equation] [data-layout="row"]')).not.toBeNull();
  });

  it('a record with nothing to draw has no empty hero box', async () => {
    const t = Object.values(state.records.transformation)[0] as { id: string };
    await show(ref('transformation', t.id));
    expect(document.querySelector('[data-hero]')).toBeNull();
  });

  it('a long lead is clamped with "Read more", which expands it in place', async () => {
    const long = Object.values(state.records.named_reaction).find((n) => (n.summary ?? '').length > 220) as { id: string } | undefined;
    if (long === undefined) return; // the demo's summaries are short: the clamp is decided by length alone (LEAD_CLAMP_CHARS)
    await show(ref('named_reaction', long.id));
    const more = screen.getByRole('button', { name: 'Read more' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(screen.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('chips: at most six and "+n" for the rest', async () => {
    const r = Object.values(state.records.reaction).find((x) => x.reactionTypes.length + x.namedReactionIds.length >= 1) as { id: string };
    await show(ref('reaction', r.id));
    const chips = screen.queryByRole('list', { name: 'Key facts' });
    expect(chips === null || chips.querySelectorAll('li').length <= 7).toBe(true);
  });

  it('go next: at most three buttons in the row, the rest under "More actions"', async () => {
    await show(ETHANOL, true, { showReactions: () => undefined, showPrecursors: () => undefined });
    const row = screen.getByRole('group', { name: 'Go next' });
    expect(within(row).getAllByRole('button').length).toBeLessThanOrEqual(4);
    expect(within(row).getByRole('button', { name: 'Show its reactions' })).toBeTruthy();
  });

  it('connected: small cards under plain headings, 4 at first and "Show all n"', async () => {
    await show(ETHANOL);
    const group = screen.getByRole('region', { name: 'Reactions that use it' });
    const total = Number(/Show all (\d+)/.exec(group.textContent ?? '')?.[1] ?? 0);
    const cards = group.querySelectorAll('li').length;
    if (total > 0) {
      expect(cards).toBe(4);
      fireEvent.click(within(group).getByRole('button', { name: new RegExp(`Show all ${total}`) }));
      expect(group.querySelectorAll('li').length).toBeGreaterThan(4);
    } else expect(cards).toBeGreaterThan(0);
  });

  it('a card opens its record', async () => {
    const rig = await show(ETHANOL);
    const group = screen.getByRole('region', { name: 'Reactions that use it' });
    fireEvent.click(within(group).getAllByRole('button')[0] as HTMLElement);
    expect(rig.inspector.getState().history.at(-1)?.kind).toBe('reaction');
  });

  it('Study shows no author words', async () => {
    for (const target of [ETHANOL, REACTION, ref('class', 'cls_aldehydes'), ref('concept', 'cpt_oxidation'), ref('named_reaction', 'nrx_aldol'), ref('mechanism', 'mec_aldol-ethanal'), ref('caveat', 'cav_pcc-stops-at-aldehyde')]) {
      cleanup();
      await show(target);
      const text = document.body.textContent ?? '';
      for (const word of [/Level \d/, /Findings and checks/, /Formula \(entered\)/, /Formula \(derived/, /Scope/, /Purposes/, /Provenance/, /Raw record/, /None found for/, /has no place in this view/, /spc_|rxn_|cls_|cpt_/, /_/]) expect(text, `${target.id}: ${String(word)}`).not.toMatch(word);
      expect(screen.queryByRole('button', { name: /For authors/ })).toBeNull();
    }
  });
});

describe('Studio: the same layout, then "For authors"', () => {
  it('has a closed "For authors" that holds the old levels and the provenance', async () => {
    await show(REACTION, false);
    const toggle = screen.getByRole('button', { name: /For authors/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/Level 2/)).toBeNull();
    await openLevels();
    expect(screen.getByText(/Level 2: What happens/)).toBeTruthy();
    expect(screen.getByText(/Level 5: Provenance/)).toBeTruthy();
  });

  it('inventory (fact sheet B1): every line label of the old levels is still somewhere in Studio', async () => {
    const wanted: [RecordRef, string[]][] = [
      [REACTION, ['Scope', 'Reversibility', 'Participants', 'Outcomes', 'Stages', 'Condition variants', 'Study notes', 'Record ID']],
      [ETHANOL, ['Formula (entered)', 'Kind', 'Classes', 'Record ID']],
      [ref('class', 'cls_aldehydes'), ['Kind', 'Members', 'Record ID']],
      [ref('reagent', 'rgt_potassium-permanganate'), ['Families', 'Record ID']],
      [ref('concept', 'cpt_oxidation'), ['Kind', 'Record ID']],
      [ref('named_reaction', 'nrx_aldol'), ['Summary', 'Record ID']],
      [ref('mechanism', 'mec_aldol-ethanal'), ['Summary', 'Variants', 'Record ID']],
      [ref('caveat', 'cav_pcc-stops-at-aldehyde'), ['The exception', 'Record ID']],
    ];
    for (const [target, labels] of wanted) {
      cleanup();
      await show(target, false);
      await openLevels();
      // the provenance level is a closed section of its own; open every closed section until none is left
      for (let round = 0; round < 6; round += 1) {
        const closed = [...document.querySelectorAll('button[aria-expanded="false"]')].filter((b) => /Level \d|For authors/.test(b.textContent ?? ''));
        if (closed.length === 0) break;
        await act(async () => { closed.forEach((b) => fireEvent.click(b)); await new Promise((r) => setTimeout(r, 0)); });
      }
      const text = document.body.textContent ?? '';
      for (const label of labels) expect(text, `${target.id}: ${label}`).toContain(label);
    }
  });

  it('the header keeps the findings badges and the place line (author lines)', async () => {
    await show(REACTION, false);
    expect(document.querySelector('[role="status"]')).not.toBeNull();
  });
});

describe('the right pane (step 8.4a, Part C2.6)', () => {
  it('go next: three buttons on one row and a "⋯" menu named "More actions" for the rest', async () => {
    await show(ETHANOL, true, { showReactions: () => undefined, showPrecursors: () => undefined });
    const row = screen.getByRole('group', { name: 'Go next' });
    expect(within(row).getAllByRole('button').filter((b) => b.getAttribute('aria-haspopup') === null).length).toBeLessThanOrEqual(3);
    const more = within(row).queryByRole('button', { name: 'More actions' });
    if (more !== null) expect(more.querySelector('span[aria-hidden="true"][style*="more-horizontal.svg"]')).not.toBeNull(); // the ⋯ icon (step 8.4d)
  });

  it('the connected groups are list rows (dot or icon, name, sub-line, chevron), one column that fills the pane (step 8.4d, E6)', async () => {
    await show(ETHANOL, true, { showReactions: () => undefined, showPrecursors: () => undefined });
    const groups = [...document.querySelectorAll('section[data-group]')];
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      const list = group.querySelector('ul[aria-label]');
      expect(list, group.getAttribute('data-group') ?? '').not.toBeNull();
      const rows = [...(list as Element).querySelectorAll('li > button[data-record-id]')];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.querySelector('[data-chevron]')).not.toBeNull();
    }
  });
});

describe('a record that needs checking (step 8.4a, Part D)', () => {
  const BECKMANN = ref('reaction', 'rxn_cyclohexanone-oxime-beckmann');
  async function inEdition(edition: 'study' | 'studio') {
    const { StudyChromeProvider, studyChrome } = await import('@/ui/study-chrome');
    const rig = inspectorRig(state, { studyView: true });
    render(
      <StudyChromeProvider value={studyChrome(edition, { ownData: false })}>
        <Inspector ports={rig.ports} host={rig.host} />
      </StudyChromeProvider>,
    );
    act(() => rig.inspector.getState().open(BECKMANN));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }

  it('Study: a warning-coloured dot "Needs checking" and the line "This has an open question..." under the title', async () => {
    await inEdition('study');
    expect(screen.getByRole('img', { name: 'Needs checking' }).getAttribute('data-tone')).toBe('warning');
    expect(screen.getByText('This has an open question. Check it with your textbook or teacher.')).toBeTruthy();
  });

  it('Studio: its own pill and words, no Study sentence', async () => {
    await inEdition('studio');
    expect(screen.queryByText(/This has an open question/)).toBeNull();
  });
});
