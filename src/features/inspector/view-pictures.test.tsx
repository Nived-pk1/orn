// @vitest-environment jsdom
/**
 * A mechanism's own pictures in the inspector (step 6.5b part 3, ADR-038 addendum P6): FIRST in the mechanism view (before the summary and the
 * variants), `<img>` only with a blob URL made and revoked through the assets port, alt text and caption from the record, never enlarged past
 * the natural size, "Open full size" in a modal dialog (Esc and Close, focus returns), bytes missing in words with the alt text, oldest first.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { produce } from 'immer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, CanonicalState } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { inspectorRig, openLevels, preloadViews } from '@/test-support/inspector-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { AssetImage, InspectorPorts } from './contracts';
import { Inspector } from './inspector';

const SN2 = 'mec_sn2-haloalkane';
beforeAll(async () => {
  await preloadViews();
  stubDialog();
});
beforeEach(() => {
  URL.createObjectURL = vi.fn();
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

function asset(id: string, over: Partial<Asset> & { createdAt?: string } = {}): Asset {
  const { createdAt = '2026-10-20T10:00:00.000Z', ...rest } = over;
  return {
    id,
    kind: 'asset',
    mediaType: 'image/png',
    byteSize: 12,
    sha256: id.padEnd(64, 'a').slice(0, 64).replace(/[^0-9a-f]/g, 'a'),
    assetRole: 'mechanism_image',
    attachedTo: [{ ref: { kind: 'mechanism', id: SN2 } }],
    tags: [],
    citations: [],
    provenance: { origin: 'user', createdAt, updatedAt: createdAt },
    review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] },
    ...rest,
  } as unknown as Asset;
}
const withAssets = (...list: Asset[]): CanonicalState =>
  produce(demoState(), (draft) => {
    for (const record of list) (draft.records.asset as Record<string, Asset>)[record.id] = record;
  });

function show(state: CanonicalState, open: InspectorPorts['assets'] | 'none' = { open: async (id) => ({ ok: true, url: `blob:pic/${id}` }), revoke: vi.fn() }) {
  const rig = inspectorRig(state);
  const ports: InspectorPorts = open === 'none' ? rig.ports : { ...rig.ports, assets: open };
  render(<Inspector ports={ports} host={rig.host} />);
  act(() => rig.inspector.getState().open({ kind: 'mechanism', id: SN2 }));
  openLevels();
  return rig;
}
const pictures = () => screen.getByRole('region', { name: 'Pictures of this mechanism' });

describe('the pictures of a mechanism', () => {
  it('come FIRST: before the summary and the variants', async () => {
    show(withAssets(asset('ast_one', { altText: 'Backside attack' })));
    const img = await within(pictures()).findByRole('img', { name: 'Backside attack' });
    const root = pictures().closest('article') ?? document.body;
    // document order: the pictures region precedes the first level section
    const firstLevel = root.querySelector('section[data-level="2"]') as HTMLElement;
    expect(pictures().compareDocumentPosition(firstLevel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(img.getAttribute('src')).toBe('blob:pic/ast_one');
  });

  it('are shown with the alt text from the record and the caption under each (rich text)', async () => {
    show(withAssets(asset('ast_one', { altText: 'Backside attack', caption: 'The *nucleophile* arrives.' })));
    const figure = (await within(pictures()).findByRole('img', { name: 'Backside attack' })).closest('figure') as HTMLElement;
    expect(within(figure).getByText('nucleophile').tagName).toBe('EM');
    expect(figure.querySelector('figcaption')?.textContent).toBe('The nucleophile arrives.');
  });

  it('are in the order they were added: oldest first; other mechanisms and detached pictures are not shown', async () => {
    show(
      withAssets(
        asset('ast_new', { altText: 'second', createdAt: '2026-10-20T11:00:00.000Z' }),
        asset('ast_old', { altText: 'first', createdAt: '2026-10-20T09:00:00.000Z' }),
        asset('ast_else', { altText: 'elsewhere', attachedTo: [{ ref: { kind: 'mechanism', id: 'mec_e2-haloalkane' } }] }),
        asset('ast_none', { altText: 'detached', attachedTo: [] }),
      ),
    );
    await waitFor(() => expect(within(pictures()).getAllByRole('img')).toHaveLength(2));
    expect(within(pictures()).getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual(['first', 'second']);
  });

  it('a mechanism with no picture has no pictures region', () => {
    show(demoState());
    expect(screen.queryByRole('region', { name: 'Pictures of this mechanism' })).toBeNull();
  });

  it('uses <img> only, at its natural size at most: no width is set on the element and the style never enlarges it', async () => {
    show(withAssets(asset('ast_one', { altText: 'x' })));
    const img = await within(pictures()).findByRole('img', { name: 'x' });
    expect(img.hasAttribute('width') || img.hasAttribute('style')).toBe(false);
    expect(pictures().querySelector('object, embed, iframe, svg, canvas')).toBeNull();
    const css = readFileSync(resolve(process.cwd(), 'src/features/inspector/inspector.module.css'), 'utf8');
    const rule = /\.mechanismPicture\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/max-width:\s*100%/);
    expect(rule).toMatch(/height:\s*auto/);
    expect(rule).not.toMatch(/[^-]width:\s*100%/); // never stretched past its natural size
  });

  it('makes its blob URL through the assets port and revokes it when the view goes', async () => {
    const revoke = vi.fn();
    show(withAssets(asset('ast_one', { altText: 'x' })), { open: async () => ({ ok: true, url: 'blob:pic/1' }), revoke });
    await within(pictures()).findByRole('img', { name: 'x' });
    cleanup();
    expect(revoke).toHaveBeenCalledWith('blob:pic/1');
    expect(URL.createObjectURL).not.toHaveBeenCalled(); // the view never makes one itself
  });

  it('bytes missing in this browser: said in words with the alt text, never a broken image', async () => {
    const missing: AssetImage = { ok: false, reason: 'missing', message: 'The bytes of this image are not stored (finding AST-002).' };
    show(withAssets(asset('ast_one', { altText: 'Backside attack' })), { open: async () => missing, revoke: vi.fn() });
    expect(await within(pictures()).findByText('Picture missing: its file is not stored in this browser')).toBeTruthy();
    expect(within(pictures()).getByText('Backside attack')).toBeTruthy();
    expect(within(pictures()).queryByRole('img')).toBeNull();
  });

  it('a window with no way to read bytes says so, with the alt text', async () => {
    show(withAssets(asset('ast_one', { altText: 'Backside attack' })), 'none');
    expect(await within(pictures()).findByText(/no way to read/)).toBeTruthy();
    expect(within(pictures()).getByText('Backside attack')).toBeTruthy();
  });
});

describe('Open full size', () => {
  it('opens a modal dialog with the picture; Close and Esc close it; focus returns to the button', async () => {
    show(withAssets(asset('ast_one', { altText: 'Backside attack' })));
    const open = await within(pictures()).findByRole('button', { name: 'Open full size' });
    open.focus();
    fireEvent.click(open);
    const dialog = await screen.findByRole('dialog', { name: 'Backside attack' });
    const big = within(dialog).getByRole('img', { name: 'Backside attack' });
    expect(big.getAttribute('src')).toBe('blob:pic/ast_one');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Backside attack' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(open));
    fireEvent.click(open);
    const again = await screen.findByRole('dialog', { name: 'Backside attack' });
    fireEvent(again, new Event('cancel', { cancelable: true })); // what the browser sends for Esc
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Backside attack' })).toBeNull());
  });
});

describe('Open full size: fitted to the screen (follow-up G1)', () => {
  async function bigImage(natural: { width: number; height: number }): Promise<HTMLElement> {
    show(withAssets(asset('ast_one', { altText: 'Backside attack' })));
    fireEvent.click(await within(pictures()).findByRole('button', { name: 'Open full size' }));
    const dialog = await screen.findByRole('dialog', { name: 'Backside attack' });
    const big = within(dialog).getByRole('img', { name: 'Backside attack' });
    Object.defineProperty(big, 'naturalWidth', { value: natural.width, configurable: true });
    Object.defineProperty(big, 'naturalHeight', { value: natural.height, configurable: true });
    fireEvent.load(big);
    return big;
  }
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 1200, configurable: true });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 600, configurable: true });
  });
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
  });

  it('a small picture is enlarged to 2x its natural size and no more', async () => {
    const big = await bigImage({ width: 100, height: 50 });
    await waitFor(() => expect(big.style.width).toBe('200px'));
    expect(big.style.height).toBe('100px');
  });
  it('a picture that is smaller than the screen but under 2x is enlarged to fit', async () => {
    const big = await bigImage({ width: 400, height: 300 });
    await waitFor(() => expect(big.style.width).toBe('800px'));
    expect(big.style.height).toBe('600px');
  });
  it('a large picture shrinks to fit', async () => {
    const big = await bigImage({ width: 3000, height: 1500 });
    await waitFor(() => expect(big.style.width).toBe('1200px'));
    expect(big.style.height).toBe('600px');
  });
  it('the picture sits in a stage that centres it both ways', async () => {
    const big = await bigImage({ width: 100, height: 50 });
    expect(big.parentElement?.getAttribute('data-picture-stage')).not.toBeNull();
  });
});
