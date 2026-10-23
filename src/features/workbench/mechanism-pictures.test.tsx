// @vitest-environment jsdom
/**
 * The mechanism editor's Pictures section (step 6.5b part 2, ADR-038 addendum P2-P6): the pictures small with Edit and Remove, "Add picture"
 * (unavailable with its reason for a mechanism never saved or a read-only tab), Remove asks and then DETACHES in words, bytes missing in words
 * with the alt text, the blob URLs revoked on unmount, the list following the store (Undo of an added picture).
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakePictures, view } from '@/test-support/pictures-kit';
import { stubDialog } from '@/test-support/window-kit';
import { MechanismPicturesSection } from './mechanism-pictures';

beforeAll(stubDialog);
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview/1');
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const isOff = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';
const TWO = [view('ast_1', 'Backside attack', 'The nucleophile arrives.', 'a.png'), view('ast_2', 'Inversion', '', 'b.png')];

function show(fake = fakePictures(TWO), props: { saved?: boolean; unavailable?: string; phone?: boolean } = {}) {
  render(<MechanismPicturesSection mechanismId="mec_x" port={fake.port} saved={props.saved ?? true} unavailable={props.unavailable} phone={props.phone} />);
  return fake;
}

describe('the pictures of a mechanism', () => {
  it('lists each picture small, with its alt text, its caption, Edit and Remove', async () => {
    show();
    const first = within(screen.getByRole('group', { name: 'Picture 1' }));
    expect((await first.findByRole('img', { name: 'Backside attack' })).getAttribute('src')).toMatch(/^blob:/);
    expect(first.getByText('The nucleophile arrives.')).toBeTruthy();
    expect(first.getByRole('button', { name: 'Edit picture 1' })).toBeTruthy();
    expect(first.getByRole('button', { name: 'Remove picture 1 from this mechanism' })).toBeTruthy();
    expect(screen.getAllByRole('group', { name: /^Picture \d$/ })).toHaveLength(2);
  });

  it('says so when there are none', () => {
    show(fakePictures([]));
    expect(screen.getByText('No pictures yet.')).toBeTruthy();
  });

  it('bytes missing in this browser are said in words with the alt text, never a broken image', async () => {
    show(fakePictures(TWO, { image: { ok: false, message: 'Picture missing: its file is not stored in this browser' } }));
    const first = within(screen.getByRole('group', { name: 'Picture 1' }));
    expect(await first.findByText('Picture missing: its file is not stored in this browser')).toBeTruthy();
    expect(first.getByText('Backside attack')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('revokes every blob URL it made when it goes away', async () => {
    const fake = show();
    await screen.findAllByRole('img');
    expect(fake.image).toHaveBeenCalledTimes(2);
    cleanup();
    expect(fake.revoke).toHaveBeenCalledTimes(2);
    expect(fake.revoke).toHaveBeenCalledWith('blob:test/1');
  });

  it('follows the store: a picture removed elsewhere (Undo of the add) leaves the list', async () => {
    const fake = show();
    await screen.findAllByRole('img');
    fake.views.pop();
    act(() => fake.changed());
    expect(screen.getAllByRole('group', { name: /^Picture \d$/ })).toHaveLength(1);
  });
});

describe('adding, editing and removing', () => {
  it('Add picture opens the dialog for this mechanism', async () => {
    show(fakePictures([]));
    fireEvent.click(screen.getByRole('button', { name: 'Add picture' }));
    expect(await screen.findByRole('dialog', { name: 'Add picture' })).toBeTruthy();
    expect(screen.getByLabelText('Picture file')).toBeTruthy();
  });

  it('a mechanism never saved cannot take a picture: "Save the mechanism once before adding pictures."', () => {
    show(fakePictures([]), { saved: false });
    expect(isOff(screen.getByRole('button', { name: 'Add picture' }))).toBe(true);
    expect(screen.getAllByText('Save the mechanism once before adding pictures.').length).toBeGreaterThan(0);
  });

  it('a read-only tab cannot add, edit or remove, and says why', () => {
    show(fakePictures(TWO), { unavailable: 'This tab is read-only' });
    for (const name of ['Add picture', 'Edit picture 1', 'Remove picture 1 from this mechanism']) expect(isOff(screen.getByRole('button', { name }))).toBe(true);
  });

  it('Edit opens the dialog with the alt text and caption of that picture', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Edit picture 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit picture' });
    expect((within(dialog).getByLabelText('Alt text (required)') as HTMLInputElement).value).toBe('Backside attack');
    expect((within(dialog).getByLabelText('Caption (optional)') as HTMLTextAreaElement).value).toBe('The nucleophile arrives.');
  });

  it('Remove asks first; Cancel keeps the picture; confirming detaches it and says what happened', async () => {
    const fake = show();
    fireEvent.click(screen.getByRole('button', { name: 'Remove picture 1 from this mechanism' }));
    expect(screen.getByRole('group', { name: 'Remove picture 1 from this mechanism?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fake.detach).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove picture 1 from this mechanism' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from this mechanism' }));
    expect(fake.detach).toHaveBeenCalledWith('mec_x', 'ast_1');
    expect(screen.getByRole('status').textContent).toBe('Removed from this mechanism. The picture stays in your data until deleting arrives (step 6.8).');
    expect(screen.getAllByRole('group', { name: /^Picture \d$/ })).toHaveLength(1);
  });

  it('a refused detach is said in words', () => {
    const fake = fakePictures(TWO);
    fake.detach.mockReturnValueOnce({ ok: false, message: 'This tab cannot save changes: it is read-only.' });
    show(fake);
    fireEvent.click(screen.getByRole('button', { name: 'Remove picture 1 from this mechanism' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from this mechanism' }));
    expect(screen.getByRole('alert').textContent).toBe('This tab cannot save changes: it is read-only.');
  });
});

describe('a blob URL is not revoked while an image still shows it (step 6.8 follow-up U1)', () => {
  it('changing the picture revokes the old URL only after its image element is gone', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fake = fakePictures([]);
      const shownWhenRevoked: boolean[] = [];
      fake.revoke.mockImplementation((url: string) => shownWhenRevoked.push(document.querySelector(`img[src="${url}"]`) !== null));
      const { PictureThumb } = await import('./picture-thumb');
      const { rerender } = render(<PictureThumb port={fake.port} picture={view('ast_1', 'First')} />);
      await screen.findByRole('img', { name: 'First' });
      rerender(<PictureThumb port={fake.port} picture={view('ast_2', 'Second')} />);
      await screen.findByRole('img', { name: 'Second' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(shownWhenRevoked).toEqual([false]);
    } finally {
      vi.useRealTimers();
    }
  });
});
