// @vitest-environment jsdom
/**
 * The review queue page (step 6.8b, R1): one compact row per record that is not verified (name, kind, status, reasons, finding counts,
 * Open in the inspector, Edit), filters, row checkboxes with Shift-click ranges and "Select all shown", and per-row and BULK
 * "Mark verified" / "Needs review". An error refuses, warnings need a confirm, "Needs review" needs a reason, and one Undo undoes a bulk.
 * A real store under a fake port; the fixed clock decides `reviewedAt`.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeStore } from '../../test-support/command-kit';
import { maximalState } from '@/test-support/inspector-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { StoreHandle } from '@/core/commands';
import type { AnyRecord, CanonicalState, RecordRef } from '@/core/schema';
import { ToastProvider } from '@/ui/primitives';
import type { ReviewPort } from './contracts';
import { ReviewPage } from './review-page';

// jsdom does no layout: the virtual list would see a 0 px window. Give elements a size.
beforeAll(() => {
  stubDialog();
  // group headings (7.3a) are items of the list too, so the scroll area is made tall: every item is rendered
  const isScroller = (el: Element): boolean => el.hasAttribute('data-virtual-list');
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return isScroller(this) ? 20_000 : 84; } });
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const height = isScroller(this) ? 20_000 : 84;
    return { x: 0, y: 0, top: 0, left: 0, right: 800, bottom: height, width: 800, height, toJSON: () => ({}) };
  };
});
afterEach(cleanup);

const NOW = '2026-10-23T12:00:00.000Z';
type Table = Record<string, { severity: string; message: string }[]>;

/** The maximal fixture where every reviewed record is verified except the ones named. */
function rig(open: Readonly<Record<string, { status?: string; reasons?: string[]; updatedAt?: string; origin?: string; tags?: string[] }>>, table: Table = {}, unavailable?: string) {
  const base = maximalState();
  const records: Record<string, Record<string, AnyRecord & { review?: Record<string, unknown>; provenance?: Record<string, unknown>; tags?: string[] }>> = JSON.parse(JSON.stringify(base.records));
  for (const byId of Object.values(records)) for (const record of Object.values(byId)) if (record.review !== undefined) record.review = { ...record.review, status: 'verified' };
  for (const [path, change] of Object.entries(open)) {
    const [kind, id] = path.split(':') as [string, string];
    const record = records[kind]?.[id];
    if (record === undefined) throw new Error(path);
    record.review = { ...record.review, status: change.status ?? 'unreviewed', reasons: change.reasons ?? [] };
    if (change.updatedAt !== undefined) record.provenance = { ...record.provenance, updatedAt: change.updatedAt };
    if (change.origin !== undefined) record.provenance = { ...record.provenance, origin: change.origin } as typeof record.provenance;
    if (change.tags !== undefined) record.tags = change.tags;
  }
  const store: StoreHandle = makeStore({ ...base, records } as unknown as CanonicalState);
  const opened = vi.fn<(ref: RecordRef) => void>();
  const edited = vi.fn<(ref: RecordRef) => void>();
  const port: ReviewPort = {
    state: store.getState,
    findingsOf: (ref) => table[`${ref.kind}:${ref.id}`] ?? [],
    subscribe: (listener) => store.subscribe(listener),
    now: () => NOW,
    dispatch: (envelope) => {
      const result = store.dispatch(envelope);
      return result.ok ? { ok: true } : { ok: false, message: result.error.message };
    },
    unavailable,
    open: opened,
    editReason: (ref) => (ref.kind === 'reaction' ? undefined : 'This kind has no editor yet.'),
    edit: edited,
  };
  return { store, port, opened, edited };
}

const SPC = Object.keys(maximalState().records.species);
const RXN = Object.keys(maximalState().records.reaction);
const CLS = Object.keys(maximalState().records.class);
const nameOf = (state: CanonicalState, kind: 'species' | 'reaction' | 'class', id: string): string => {
  const record = (state.records[kind] as Record<string, { names?: { canonical: string }; name?: string }>)[id];
  return record?.names?.canonical ?? record?.name ?? id;
};

function show(port: ReviewPort) {
  return render(
    <ToastProvider>
      <ReviewPage port={port} />
    </ToastProvider>,
  );
}
// the group headings (7.3a E1) are items of the same list; a row is an item without one
const rows = (): HTMLElement[] => within(screen.getByRole('list', { name: 'Records to review' })).getAllByRole('listitem').filter((item) => item.querySelector('h3') === null);
const rowOf = (name: string): HTMLElement => {
  const found = rows().find((row) => row.textContent?.includes(name));
  if (found === undefined) throw new Error(`no row for ${name}`);
  return found;
};

describe('the rows', () => {
  it('each row names the record, its kind, status, reasons and finding counts; Open and Edit', () => {
    const r = rig({ [`species:${SPC[0]}`]: { status: 'review_required', reasons: ['Imported without a source'] }, [`reaction:${RXN[0]}`]: {} }, {
      [`species:${SPC[0]}`]: [{ severity: 'error', message: 'Bad formula' }, { severity: 'warning', message: 'Odd charge' }, { severity: 'warning', message: 'More' }],
    });
    show(r.port);
    const name = nameOf(r.store.getState(), 'species', SPC[0] as string);
    const row = rowOf(name);
    expect(row.textContent).toContain('species');
    expect(row.textContent).toContain('Needs review');
    expect(row.textContent).toContain('Imported without a source');
    expect(row.textContent).toContain('1 error');
    expect(row.textContent).toContain('2 warnings');
    fireEvent.click(within(row).getByRole('button', { name: `Open ${name} in the inspector` }));
    expect(r.opened).toHaveBeenCalledWith({ kind: 'species', id: SPC[0] });
    const edit = within(row).getByRole('button', { name: `Edit ${name}` });
    expect(edit.getAttribute('aria-disabled')).toBe('true'); // this kind has no editor: said, not hidden
    const reaction = rowOf(nameOf(r.store.getState(), 'reaction', RXN[0] as string));
    fireEvent.click(within(reaction).getByRole('button', { name: /^Edit / }));
    expect(r.edited).toHaveBeenCalledWith({ kind: 'reaction', id: RXN[0] });
  });

  it('says so when nothing needs review', () => {
    show(rig({}).port);
    expect(screen.getByText('Nothing needs review.')).toBeTruthy();
  });
});

describe('filters', () => {
  it('Kind, Status, Has errors, Has warnings, Origin and Tag narrow the list; the count says how many are shown', () => {
    const r = rig(
      { [`species:${SPC[0]}`]: { status: 'review_required', origin: 'import', tags: ['jee'] }, [`species:${SPC[1]}`]: { origin: 'user' }, [`reaction:${RXN[0]}`]: { origin: 'import', tags: ['jee'] } },
      { [`species:${SPC[0]}`]: [{ severity: 'error', message: 'e' }], [`reaction:${RXN[0]}`]: [{ severity: 'warning', message: 'w' }] },
    );
    show(r.port);
    expect(rows()).toHaveLength(3);
    fireEvent.change(screen.getByRole('combobox', { name: 'Kind' }), { target: { value: 'species' } });
    expect(rows()).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'review_required' } });
    expect(rows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Kind' }), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Has errors'));
    expect(rows()).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('Has errors'));
    fireEvent.click(screen.getByLabelText('Has warnings'));
    expect(rows()).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('Has warnings'));
    fireEvent.change(screen.getByLabelText('Origin'), { target: { value: 'user' } });
    expect(rows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Origin'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'jee' } });
    expect(rows()).toHaveLength(2);
    expect(screen.getByText('2 of 3 records shown')).toBeTruthy();
  });

  it('lists errors first, then warnings, then the oldest update', () => {
    const r = rig(
      { [`species:${SPC[0]}`]: { updatedAt: '2026-01-05T00:00:00.000Z' }, [`species:${SPC[1]}`]: { updatedAt: '2026-01-01T00:00:00.000Z' }, [`reaction:${RXN[0]}`]: { updatedAt: '2026-01-09T00:00:00.000Z' } },
      { [`reaction:${RXN[0]}`]: [{ severity: 'error', message: 'e' }] },
    );
    show(r.port);
    const names = [nameOf(r.store.getState(), 'reaction', RXN[0] as string), nameOf(r.store.getState(), 'species', SPC[1] as string), nameOf(r.store.getState(), 'species', SPC[0] as string)];
    expect(rows().map((row) => names.findIndex((one) => row.textContent?.includes(one)))).toEqual([0, 1, 2]);
  });
});

describe('selection', () => {
  const four = () =>
    rig({ [`species:${SPC[0]}`]: { updatedAt: '2026-01-01T00:00:00.000Z' }, [`species:${SPC[1]}`]: { updatedAt: '2026-01-02T00:00:00.000Z' }, [`species:${SPC[2]}`]: { updatedAt: '2026-01-03T00:00:00.000Z' }, [`class:${CLS[0]}`]: { updatedAt: '2026-01-04T00:00:00.000Z' } });

  it('Shift-click selects a range; Select all shown selects every shown row; Clear empties it', () => {
    const r = four();
    show(r.port);
    const boxes = (): HTMLInputElement[] => rows().map((row) => within(row).getByRole('checkbox') as HTMLInputElement);
    fireEvent.click(boxes()[0] as HTMLInputElement);
    fireEvent.click(boxes()[2] as HTMLInputElement, { shiftKey: true });
    expect(boxes().map((box) => box.checked)).toEqual([true, true, true, false]);
    expect(screen.getByText('3 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.getByText('0 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Select all shown' }));
    expect(screen.getByText('4 selected')).toBeTruthy();
  });
});

describe('Mark verified', () => {
  it('a clean bulk is ONE step: status verified, reviewedAt from the clock, the rows leave the queue, one Undo brings them back', () => {
    const r = rig({ [`species:${SPC[0]}`]: { status: 'review_required', reasons: ['Check source'] }, [`species:${SPC[1]}`]: {} });
    show(r.port);
    fireEvent.click(screen.getByRole('button', { name: 'Select all shown' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark verified (2)' }));
    const record = r.store.getState().records.species[SPC[0] as string] as unknown as { review: { status: string; reviewedAt?: string; reasons: string[] } };
    expect(record.review).toMatchObject({ status: 'verified', reviewedAt: NOW, reasons: ['Check source'] });
    expect(screen.getByText('Nothing needs review.')).toBeTruthy(); // left the queue at once
    act(() => void r.store.undo());
    expect(rows()).toHaveLength(2);
  });

  it('an ERROR refuses that record (listed with its first error) and the rest wait for the confirm; nothing changes before "Mark verified"', async () => {
    const r = rig({ [`species:${SPC[0]}`]: {}, [`species:${SPC[1]}`]: {}, [`species:${SPC[2]}`]: {} }, {
      [`species:${SPC[0]}`]: [{ severity: 'error', message: 'Formula is wrong' }],
      [`species:${SPC[1]}`]: [{ severity: 'warning', message: 'Charge looks odd' }, { severity: 'warning', message: 'Second' }],
    });
    show(r.port);
    fireEvent.click(screen.getByRole('button', { name: 'Select all shown' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark verified (3)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mark verified' });
    const refused = within(dialog).getByRole('list', { name: 'Not verified: these have an error' });
    expect(refused.textContent).toContain('Formula is wrong');
    const warned = within(dialog).getByRole('list', { name: 'Verified with warnings' });
    expect(warned.textContent).toContain('2 warnings');
    expect(warned.textContent).toContain('Charge looks odd');
    expect((r.store.getState().records.species[SPC[1] as string] as unknown as { review: { status: string } }).review.status).toBe('unreviewed');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark verified (2)' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mark verified' })).toBeNull());
    const after = r.store.getState().records.species as unknown as Record<string, { review: { status: string } }>;
    expect(after[SPC[0] as string]?.review.status).toBe('unreviewed'); // refused
    expect(after[SPC[1] as string]?.review.status).toBe('verified');
    expect(after[SPC[2] as string]?.review.status).toBe('verified');
    expect(rows()).toHaveLength(1);
    act(() => void r.store.undo()); // ONE step for both
    expect(rows()).toHaveLength(3);
  });

  it('a row\'s own Mark verified works the same way; a read-only tab says why', () => {
    const r = rig({ [`species:${SPC[0]}`]: {} });
    show(r.port);
    const name = nameOf(r.store.getState(), 'species', SPC[0] as string);
    fireEvent.click(within(rowOf(name)).getByRole('button', { name: `Mark ${name} verified` }));
    expect(screen.getByText('Nothing needs review.')).toBeTruthy();
    cleanup();
    const locked = rig({ [`species:${SPC[0]}`]: {} }, {}, 'This tab is read-only');
    show(locked.port);
    fireEvent.click(screen.getByRole('button', { name: 'Select all shown' }));
    expect(screen.getByRole('button', { name: 'Mark verified (1)' }).getAttribute('aria-disabled')).toBe('true');
  });
});

describe('Needs review', () => {
  it('needs a reason; the reason is added to the reasons of every selected record, one Undo', async () => {
    const r = rig({ [`species:${SPC[0]}`]: { reasons: ['Old'] }, [`species:${SPC[1]}`]: {} });
    show(r.port);
    fireEvent.click(screen.getByRole('button', { name: 'Select all shown' }));
    fireEvent.click(screen.getByRole('button', { name: 'Needs review (2)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Needs review' });
    const confirm = within(dialog).getByRole('button', { name: 'Needs review (2)' });
    expect(confirm.getAttribute('aria-disabled')).toBe('true'); // no reason yet
    fireEvent.change(within(dialog).getByLabelText('Why does this need review? (one line)'), { target: { value: 'Source is missing' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Needs review (2)' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Needs review' })).toBeNull());
    const after = r.store.getState().records.species as unknown as Record<string, { review: { status: string; reasons: string[] } }>;
    expect(after[SPC[0] as string]?.review).toMatchObject({ status: 'review_required', reasons: ['Old', 'Source is missing'] });
    expect(after[SPC[1] as string]?.review).toMatchObject({ status: 'review_required', reasons: ['Source is missing'] });
    expect(rows()).toHaveLength(2); // still in the queue, now with the reason
    expect(screen.getAllByText(/Source is missing/).length).toBeGreaterThan(0);
  });
});
