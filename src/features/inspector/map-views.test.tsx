// @vitest-environment jsdom
/** The arrow view and the bucket view (step 8.2b-fix, S2, S3): what they draw, and that a tap opens the right thing. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArrowPane, BucketPane } from './map-views';
import type { MapInspectorView } from './model/map-inspector-view';

afterEach(cleanup);

const bucket: Extract<MapInspectorView, { kind: 'bucket' }> = {
  kind: 'bucket',
  chip: 'Not in a family yet',
  title: 'Compounds not in a family yet',
  lead: 'These compounds appear in reactions, but no family covers them yet.',
  authorsLine: 'Give these compounds a family in the content data',
  rows: [
    { ref: { kind: 'species', id: 'spc_x' }, name: 'Ethanal', reactions: 3, madeFrom: [{ id: 'cls_amines', name: 'Amines', count: 2 }], goesOn: [{ id: 'cls_alkynes', name: 'Alkynes', count: 1 }] },
    { ref: { kind: 'species', id: 'spc_y' }, name: 'Loner', reactions: 1, madeFrom: [], goesOn: [] },
  ],
};
const arrow: Extract<MapInspectorView, { kind: 'arrow' }> = {
  kind: 'arrow',
  chip: 'Arrow',
  title: 'Amines → Not in a family yet',
  from: { id: 'cls_amines', name: 'Amines', bucket: false },
  to: { id: 'virtual:unclassified:hub', name: 'Not in a family yet', bucket: true },
  count: '2 reactions',
  reactions: [],
};

describe('BucketPane', () => {
  it('shows the chip, the title, the lead, the authors line and a row per compound with its chips', () => {
    render(<BucketPane view={bucket} actions={{ focusEnd: () => undefined, open: () => undefined, titleId: 't' }} />);
    expect(screen.getByText('Not in a family yet')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Compounds not in a family yet' })).toBeTruthy();
    expect(screen.getByText('These compounds appear in reactions, but no family covers them yet.')).toBeTruthy();
    expect(screen.getByText('Give these compounds a family in the content data')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Made from: Amines (2)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Goes on to: Alkynes (1)' })).toBeTruthy();
    const rows = within(screen.getByRole('list', { name: 'Compounds in no family' })).getAllByRole('listitem', { hidden: false });
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
  it('a chip focuses that family; a row opens the compound itself', () => {
    const focusEnd = vi.fn();
    const open = vi.fn();
    render(<BucketPane view={bucket} actions={{ focusEnd, open, titleId: 't' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Made from: Amines (2)' }));
    expect(focusEnd).toHaveBeenCalledWith('cls_amines');
    fireEvent.click(screen.getByRole('button', { name: /Ethanal/ }));
    expect(open).toHaveBeenCalledWith({ kind: 'species', id: 'spc_x' });
  });
  it('Study has no authors line', () => {
    const { authorsLine: _unused, ...study } = bucket;
    render(<BucketPane view={study} actions={{ focusEnd: () => undefined, open: () => undefined, titleId: 't' }} />);
    expect(screen.queryByText('Give these compounds a family in the content data')).toBeNull();
  });
});

describe('ArrowPane', () => {
  it('the chip, the title naming both ends, the two ends as buttons and the count', () => {
    render(<ArrowPane view={arrow} actions={{ focusEnd: () => undefined, open: () => undefined, titleId: 't' }} />);
    expect(screen.getByText('Arrow')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Amines → Not in a family yet' })).toBeTruthy();
    expect(screen.getByText('2 reactions')).toBeTruthy();
  });
  it('tapping an end focuses that family or the bucket', () => {
    const focusEnd = vi.fn();
    render(<ArrowPane view={arrow} actions={{ focusEnd, open: () => undefined, titleId: 't' }} />);
    const ends = within(screen.getByRole('list', { name: 'Ends of this arrow' }));
    fireEvent.click(ends.getByRole('button', { name: 'Amines' }));
    fireEvent.click(ends.getByRole('button', { name: 'Not in a family yet' }));
    expect(focusEnd.mock.calls).toEqual([['cls_amines'], ['virtual:unclassified:hub']]);
  });
});
