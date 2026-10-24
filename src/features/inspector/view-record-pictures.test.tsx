// @vitest-environment jsdom
/**
 * The pictures of ANY PICTURE_KINDS record in the inspector (step 7.1a, ADR-038 addendum Q5): ONE component, "Pictures of this <kind word>",
 * before the first level, oldest first, `<img>` with a blob URL, "Open full size", bytes missing in words; a kind outside PICTURE_KINDS shows
 * none even if an asset names it. The mechanism's own tests (view-pictures.test.tsx) cover the same component for mechanisms.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { produce } from 'immer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PICTURE_KINDS } from '@/core/editing';
import type { Asset, CanonicalState, RecordRef } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { inspectorRig, openLevels, preloadViews } from '@/test-support/inspector-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { AssetImage, InspectorPorts } from './contracts';
import { Inspector } from './inspector';

beforeAll(async () => {
  await preloadViews();
  stubDialog();
});
beforeEach(() => {
  URL.createObjectURL = vi.fn();
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const firstOf = (state: CanonicalState, kind: string): RecordRef => ({ kind, id: Object.keys(state.records[kind as 'concept'])[0] as string }) as RecordRef;

function asset(id: string, target: RecordRef, over: Partial<Asset> = {}): Asset {
  return {
    id,
    kind: 'asset',
    mediaType: 'image/png',
    byteSize: 12,
    sha256: 'a'.repeat(64),
    assetRole: 'reference_image',
    attachedTo: [{ ref: target }],
    tags: [],
    citations: [],
    provenance: { origin: 'user', createdAt: '2026-10-24T10:00:00.000Z', updatedAt: '2026-10-24T10:00:00.000Z' },
    review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] },
    ...over,
  } as unknown as Asset;
}
const withAssets = (...list: Asset[]): CanonicalState =>
  produce(demoState(), (draft) => {
    for (const record of list) (draft.records.asset as Record<string, Asset>)[record.id] = record;
  });

function show(state: CanonicalState, target: RecordRef, open: InspectorPorts['assets'] = { open: async (id) => ({ ok: true, url: `blob:pic/${id}` }), revoke: vi.fn() }) {
  const rig = inspectorRig(state);
  render(<Inspector ports={{ ...rig.ports, assets: open }} host={rig.host} />);
  act(() => rig.inspector.getState().open(target));
  openLevels();
  return rig;
}

describe('the pictures of a concept', () => {
  const concept = firstOf(demoState(), 'concept');

  it('shows the picture before the first level, with alt text, caption, a blob URL and "Open full size"', async () => {
    show(withAssets(asset('ast_one', concept, { altText: 'A drawing of the idea', caption: 'The *idea* in a picture.' })), concept);
    const region = screen.getByRole('region', { name: 'Pictures of this concept' });
    const img = await within(region).findByRole('img', { name: 'A drawing of the idea' });
    expect(img.getAttribute('src')).toBe('blob:pic/ast_one');
    expect(region.querySelector('figcaption')?.textContent).toBe('The idea in a picture.');
    const firstLevel = (region.closest('article') ?? document.body).querySelector('section[data-level="2"]') as HTMLElement;
    expect(region.compareDocumentPosition(firstLevel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: 'Open full size' }));
    expect(await screen.findByRole('dialog', { name: 'A drawing of the idea' })).toBeTruthy();
  });

  it('bytes missing in this browser are said in words with the alt text', async () => {
    const missing: AssetImage = { ok: false, reason: 'missing', message: 'The bytes of this image are not stored (finding AST-002).' };
    show(withAssets(asset('ast_one', concept, { altText: 'A drawing' })), concept, { open: async () => missing, revoke: vi.fn() });
    const region = screen.getByRole('region', { name: 'Pictures of this concept' });
    expect(await within(region).findByText('Picture missing: its file is not stored in this browser')).toBeTruthy();
    expect(within(region).getByText('A drawing')).toBeTruthy();
    expect(within(region).queryByRole('img')).toBeNull();
  });

  it('is oldest first, and shows only the pictures attached to THIS concept', async () => {
    const other = { kind: 'concept', id: Object.keys(demoState().records.concept)[1] } as RecordRef;
    show(
      withAssets(
        asset('ast_new', concept, { altText: 'second', provenance: { origin: 'user', createdAt: '2026-10-24T11:00:00.000Z', updatedAt: '2026-10-24T11:00:00.000Z' } } as Partial<Asset>),
        asset('ast_old', concept, { altText: 'first', provenance: { origin: 'user', createdAt: '2026-10-24T09:00:00.000Z', updatedAt: '2026-10-24T09:00:00.000Z' } } as Partial<Asset>),
        asset('ast_else', other, { altText: 'elsewhere' }),
      ),
      concept,
    );
    const region = screen.getByRole('region', { name: 'Pictures of this concept' });
    await waitFor(() => expect(within(region).getAllByRole('img')).toHaveLength(2));
    expect(within(region).getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual(['first', 'second']);
  });

  it('a concept with no picture has no pictures region', () => {
    show(demoState(), concept);
    expect(screen.queryByRole('region', { name: /^Pictures of this/ })).toBeNull();
  });
});

describe('every PICTURE_KINDS kind and no other', () => {
  it.each([...PICTURE_KINDS])('a %s with a picture names its own kind word', async (kind) => {
    const target = firstOf(demoState(), kind);
    show(withAssets(asset('ast_one', target, { altText: 'pic' })), target);
    const word = kind.replace(/_/g, ' ');
    expect(await screen.findByRole('region', { name: `Pictures of this ${word}` })).toBeTruthy();
  });

  it('a topic (not a picture kind) shows none, even when an asset names it', () => {
    const topic = firstOf(demoState(), 'topic');
    show(withAssets(asset('ast_one', topic, { altText: 'pic' })), topic);
    expect(screen.queryByRole('region', { name: /^Pictures of this/ })).toBeNull();
  });
});
