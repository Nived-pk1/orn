// @vitest-environment jsdom
/**
 * The Pictures section of any PICTURE_KINDS editor (step 7.1a, ADR-038 addendum Q3 and Q4): the same list, dialog and detach as the mechanism's,
 * its words generic in the kind word ("Save the <kind word> once before adding pictures.", "Removed from this <kind word>. ..."), the target
 * handed to the port as a record reference, a kind that is not saved unavailable with its reason.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakePictures, view } from '@/test-support/pictures-kit';
import { stubDialog } from '@/test-support/window-kit';
import { RecordPicturesSection } from './record-pictures';

beforeAll(stubDialog);
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview/1');
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const isOff = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';
const ONE = [view('ast_1', 'A drawing of the idea', 'Caption here.', 'a.png')];

function show(kind: 'concept' | 'named_reaction', fake = fakePictures(ONE), props: { saved?: boolean } = {}) {
  render(<RecordPicturesSection target={{ kind, id: `${kind}_x` } as never} port={fake.port} saved={props.saved ?? true} />);
  return fake;
}

describe('the pictures of a concept', () => {
  it('lists the picture with its alt text, caption, Edit and a Remove that names the kind', async () => {
    show('concept');
    const first = within(screen.getByRole('group', { name: 'Picture 1' }));
    expect((await first.findByRole('img', { name: 'A drawing of the idea' })).getAttribute('src')).toMatch(/^blob:/);
    expect(first.getByText('Caption here.')).toBeTruthy();
    expect(first.getByRole('button', { name: 'Remove picture 1 from this concept' })).toBeTruthy();
  });

  it('shows the caption through the rich-text preview: emphasis is drawn, never the asterisks, never HTML (7.1b F1)', async () => {
    const fake = fakePictures([view('ast_9', 'A sketch', 'My own *ranking* sketch. <b>x</b>', 'c.png')]);
    show('concept', fake);
    const first = within(screen.getByRole('group', { name: 'Picture 1' }));
    expect((await first.findByText('ranking')).tagName).toBe('EM');
    expect(first.queryByText(/\*ranking\*/)).toBeNull();
    expect(first.getByText(/<b>x<\/b>/)).toBeTruthy(); // typed HTML stays text
    expect(first.queryByText('x', { selector: 'b' })).toBeNull();
  });

  it('asks the port for the pictures of THIS record, by reference', () => {
    const fake = fakePictures(ONE);
    const list = vi.spyOn(fake.port, 'list');
    show('named_reaction', fake);
    expect(list).toHaveBeenCalledWith({ kind: 'named_reaction', id: 'named_reaction_x' });
  });

  it('a concept never saved cannot take a picture and says so in its own words', () => {
    show('concept', fakePictures([]), { saved: false });
    expect(isOff(screen.getByRole('button', { name: 'Add picture' }))).toBe(true);
    expect(screen.getAllByText('Save the concept once before adding pictures.').length).toBeGreaterThan(0);
  });

  it('a named reaction says "named reaction"', () => {
    show('named_reaction', fakePictures([]), { saved: false });
    expect(screen.getAllByText('Save the named reaction once before adding pictures.').length).toBeGreaterThan(0);
  });

  it('Remove asks, then detaches by reference and says what happened in the kind word', async () => {
    const fake = show('concept');
    fireEvent.click(await screen.findByRole('button', { name: 'Remove picture 1 from this concept' }));
    expect(screen.getByText('The picture is detached from this concept. It stays in your data. This can be undone.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove from this concept' }));
    expect(fake.detach).toHaveBeenCalledWith({ kind: 'concept', id: 'concept_x' }, 'ast_1');
    expect(screen.getByText('Removed from this concept. The picture stays in your data until you delete it.')).toBeTruthy();
  });

  it('Add picture opens the dialog for this record', async () => {
    show('concept');
    fireEvent.click(screen.getByRole('button', { name: 'Add picture' }));
    expect(await screen.findByRole('dialog', { name: 'Add picture' })).toBeTruthy();
  });
});
