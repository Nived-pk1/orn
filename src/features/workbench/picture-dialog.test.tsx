// @vitest-environment jsdom
/**
 * The picture dialog (step 6.5b part 2, ADR-038 addendum P2, P3, P5): a file chooser limited to the supported types (no `capture`), a preview,
 * alt text required, caption optional; refusals in words with nothing saved; "saved now" said; Edit is the same dialog for alt text and caption.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakePictures, view } from '@/test-support/pictures-kit';
import { stubDialog } from '@/test-support/window-kit';
import { PictureDialog } from './picture-dialog';

beforeAll(stubDialog);
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview/1');
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const PNG_FILE = () => new File([new Uint8Array([0x89, 0x50])], 'step.png', { type: 'image/png' });
const chooser = () => screen.getByLabelText('Picture file') as HTMLInputElement;
const choose = (file: File = PNG_FILE()) => fireEvent.change(chooser(), { target: { files: [file] } });
const addButton = () => screen.getByRole('button', { name: 'Add picture' });
const isOff = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';
const PREVIEW = { name: 'Preview of the chosen picture' };

function open(fake = fakePictures(), onClose = vi.fn(), mode: Parameters<typeof PictureDialog>[0]['mode'] = { kind: 'add', mechanismId: 'mec_x' }) {
  render(<PictureDialog mode={mode} port={fake.port} onClose={onClose} />);
  return { fake, onClose };
}

describe('adding', () => {
  it('the chooser looks like the buttons of the app ("Choose a picture", then the chosen file name); the real file input stays (follow-up G2)', () => {
    open();
    const button = screen.getByText('Choose a picture');
    expect(button.tagName).toBe('LABEL');
    expect(button.getAttribute('for')).toBe('picture-file');
    expect(chooser().type).toBe('file');
    expect(screen.getByText('No file chosen')).toBeTruthy();
    choose();
    expect(screen.getByText('step.png')).toBeTruthy();
    expect(screen.queryByText('No file chosen')).toBeNull();
  });

  it('the chooser accepts exactly the supported media types and has no capture attribute (a phone offers its system chooser)', () => {
    open();
    expect(chooser().getAttribute('accept')).toBe('image/png,image/jpeg,image/webp,image/gif,image/svg+xml');
    expect(chooser().hasAttribute('capture')).toBe(false);
  });

  it('says the picture is saved now, and asks for alt text with its reason', () => {
    open();
    expect(screen.getByText("The picture is saved now; it does not wait for the mechanism's Save.")).toBeTruthy();
    expect(screen.getByText('Describe what the picture shows. It is read aloud, and shown if the picture cannot load.')).toBeTruthy();
  });

  it('Add picture is unavailable until a file is chosen AND alt text is written; the caption is optional', async () => {
    const { fake } = open();
    expect(isOff(addButton())).toBe(true);
    choose();
    expect(await screen.findByRole('img', PREVIEW)).toBeTruthy();
    expect(isOff(addButton())).toBe(true);
    fireEvent.change(screen.getByLabelText('Alt text (required)'), { target: { value: 'Backside attack' } });
    expect(isOff(addButton())).toBe(false);
    fireEvent.click(addButton());
    await waitFor(() => expect(fake.add).toHaveBeenCalledTimes(1));
    expect(fake.add.mock.calls[0]?.[2]).toMatchObject({ altText: 'Backside attack', caption: '' });
  });

  it('shows a preview from a blob URL (an <img>) and revokes it when the dialog closes', async () => {
    const { fake } = open();
    choose();
    const img = (await screen.findByRole('img', PREVIEW)) as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('blob:preview/1');
    expect(fake.prepare).toHaveBeenCalledTimes(1);
    cleanup();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview/1');
  });

  it('passes the mechanism, the checked picture, the typed words and the natural size to the port, then closes', async () => {
    const { fake, onClose } = open();
    choose();
    const img = (await screen.findByRole('img', PREVIEW)) as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', { value: 64 });
    Object.defineProperty(img, 'naturalHeight', { value: 32 });
    fireEvent.load(img);
    fireEvent.change(screen.getByLabelText('Alt text (required)'), { target: { value: ' Backside attack ' } });
    fireEvent.change(screen.getByLabelText('Caption (optional)'), { target: { value: 'The *nucleophile* arrives.' } });
    fireEvent.click(addButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fake.add).toHaveBeenCalledWith('mec_x', expect.objectContaining({ mediaType: 'image/png', sha256: 'a'.repeat(64) }), { altText: ' Backside attack ', caption: 'The *nucleophile* arrives.', width: 64, height: 32 });
  });

  it.each([
    ['a file over the cap', 'This file is 25.0 MB. The largest picture the app keeps is 20 MB.'],
    ['a file that is not a picture (a wrong type renamed .png)', 'This file is not a picture the app can show: PNG, JPEG, WebP, GIF or SVG.'],
    ['an unreadable file', 'This file could not be read.'],
  ])('%s is refused in words, with no preview, and nothing can be saved', async (_what, message) => {
    const { fake } = open(fakePictures([], { prepare: { ok: false, message } }));
    choose();
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(screen.queryByRole('img', PREVIEW)).toBeNull();
    fireEvent.change(screen.getByLabelText('Alt text (required)'), { target: { value: 'x' } });
    expect(isOff(addButton())).toBe(true);
    expect(fake.add).not.toHaveBeenCalled();
  });

  it('a picture the browser cannot show is said, and cannot be added', async () => {
    open();
    choose();
    fireEvent.error(await screen.findByRole('img', PREVIEW));
    expect((await screen.findByRole('alert')).textContent).toBe('The browser could not read this picture.');
    fireEvent.change(screen.getByLabelText('Alt text (required)'), { target: { value: 'x' } });
    expect(isOff(addButton())).toBe(true);
  });

  it('a refusal by the port stays in the dialog in words and the dialog stays open', async () => {
    const { onClose } = open(fakePictures([], { add: { ok: false, message: 'The picture was not saved (VALIDATION_FAILED): nope' } }));
    choose();
    await screen.findByRole('img', PREVIEW);
    fireEvent.change(screen.getByLabelText('Alt text (required)'), { target: { value: 'x' } });
    fireEvent.click(addButton());
    expect((await screen.findByRole('alert')).textContent).toBe('The picture was not saved (VALIDATION_FAILED): nope');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('editing', () => {
  it('is the same dialog for alt text and caption: no file chooser, the values filled in, saved the same way', async () => {
    const fake = fakePictures([view('ast_1', 'Old alt', 'Old caption', 'a.png')]);
    const { onClose } = open(fake, vi.fn(), { kind: 'edit', picture: view('ast_1', 'Old alt', 'Old caption', 'a.png') });
    expect(screen.queryByLabelText('Picture file')).toBeNull();
    expect(screen.getByText("The picture is saved now; it does not wait for the mechanism's Save.")).toBeTruthy();
    expect((screen.getByLabelText('Alt text (required)') as HTMLInputElement).value).toBe('Old alt');
    fireEvent.change(screen.getByLabelText('Alt text (required)'), { target: { value: 'New alt' } });
    fireEvent.change(screen.getByLabelText('Caption (optional)'), { target: { value: '' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save picture' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fake.edit).toHaveBeenCalledWith('ast_1', { altText: 'New alt', caption: '' });
  });

  it('cannot be saved with the alt text cleared', () => {
    open(fakePictures(), vi.fn(), { kind: 'edit', picture: view('ast_1', 'Old alt') });
    fireEvent.change(screen.getByLabelText('Alt text (required)'), { target: { value: '  ' } });
    expect(isOff(screen.getByRole('button', { name: 'Save picture' }))).toBe(true);
  });
});
