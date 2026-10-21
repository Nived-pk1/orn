// @vitest-environment jsdom
/**
 * The read-only "Relationships" list every record editor shows (step 6.6b part 4, decision N5): the relationships this record is an end of,
 * in words, each with a way to open it in the inspector (the draft is kept). Derived from the stored relationships; nothing is edited here.
 */
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { showKnowledge } from '@/test-support/knowledge-kit';
import { stubDialog } from '@/test-support/window-kit';

beforeAll(stubDialog);
afterEach(cleanup);

const open = (): void => {
  const toggle = screen.getAllByRole('button', { name: /Relationships/ })[0] as HTMLElement;
  if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
};

describe('the Relationships list', () => {
  it('a reaction lists its relationships in words, from either end, and opens one in the inspector', () => {
    const { openRecord, rig, id } = showKnowledge('reaction', { target: 'rxn_benzaldehyde-cannizzaro' });
    fireEvent.change(screen.getByLabelText('Name (required)'), { target: { value: 'Cannizzaro of benzaldehyde' } }); // an edited session is kept on close
    open();
    const list = screen.getByRole('list', { name: 'Relationships' });
    expect(within(list).getByText('commonly confused with Aldol reaction of ethanal')).toBeTruthy();
    fireEvent.click(within(list).getByRole('button', { name: 'Open commonly confused with Aldol reaction of ethanal in the inspector' }));
    expect(openRecord).toHaveBeenCalledWith({ kind: 'relationship', id: 'rel_cannizzaro-aldol-confusion' });
    expect(rig.drafts.entry(id)).toBeDefined();
  });
  it('a directed relationship reads with the label at the other end ("requires")', () => {
    showKnowledge('concept', { target: 'cpt_carbocation-stability' });
    open();
    const list = screen.getByRole('list', { name: 'Relationships' });
    expect(within(list).getByText('requires Hyperconjugation')).toBeTruthy();
    expect(within(list).getByText('prerequisite of Markovnikov\'s rule')).toBeTruthy();
  });
  it('says so when there are none, and a new record has none', () => {
    showKnowledge('species', { blank: true });
    open();
    expect(screen.getByText('No relationships.')).toBeTruthy();
  });
});
