// @vitest-environment jsdom
/**
 * The review queue in the Studio window (step 6.8b, R1), over the demo dataset: records this test sets to "not reviewed" are listed, two are
 * verified in bulk (ONE step, `reviewedAt` from the injected clock), a record with an ERROR finding is refused in words, a record with a
 * warning asks first, and one Undo from the top bar brings the records back. The Study window has no Review page at all.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadStudio() {
  vi.resetModules();
  vi.stubGlobal('__ORN_EDITION__', 'studio');
  const rtl = await import('@testing-library/react');
  const kit = await import('@/test-support/window-kit');
  const { demoState } = await import('@/test-support/app-boot-kit');
  const { fakeLayout } = await import('@/test-support/inspector-kit');
  kit.stubDialog();
  fakeLayout();
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  return { ...rtl, ...kit, demoState };
}
const k = await loadStudio();
afterEach(() => {
  k.cleanup();
});

const NOW = new Date(1_790_000_000_000).toISOString();
type Rev = { review: { status: string; reasons: string[]; reviewedAt?: string } };

function open(prepare: (ids: string[]) => { error?: string; warning?: string }) {
  const app = k.fakeApp({ state: k.demoState(), navigator: { depictions: true } });
  const species = Object.keys(app.store.getState().records.species).sort();
  const ids = [species[0] as string, species[1] as string, species[2] as string];
  // the demo is mostly verified or not: make exactly these three the whole queue
  const every = app.store.getState().records;
  const updates = Object.values(every).flatMap((table) => Object.values(table as Record<string, { review?: unknown }>)).filter((record) => record.review !== undefined);
  k.act(() => {
    app.store.dispatch({ label: 'prepare', commands: updates.map((record) => ({ type: 'record.update', record: { ...(record as object), review: { ...(record as Rev).review, status: ids.includes((record as { id: string }).id) ? 'unreviewed' : 'verified', reasons: [] } } }) as never) });
  });
  const wanted = prepare(ids);
  const ref = (id: string) => ({ kind: 'species', id }) as never;
  if (wanted.error !== undefined) app.store.findings.replaceForSubjects([ref(ids[0] as string)], [{ id: 'fnd_e', ruleId: 'TEST-E', level: 3, severity: 'error', subject: ref(ids[0] as string), message: wanted.error, related: [] }], 3);
  if (wanted.warning !== undefined) app.store.findings.replaceForSubjects([ref(ids[1] as string)], [{ id: 'fnd_w', ruleId: 'TEST-W', level: 3, severity: 'warning', subject: ref(ids[1] as string), message: wanted.warning, related: [] }], 3);
  k.renderWithApp(app);
  k.fireEvent.click(k.within(k.screen.getByRole('navigation', { name: 'Modes' })).getByText('Review'));
  return { app, ids };
}
const reviewOf = (app: ReturnType<typeof open>['app'], id: string): Rev['review'] => (app.store.getState().records.species[id] as unknown as Rev).review;

describe('the Review page in Studio', () => {
  it('verifies two records in bulk with the injected clock, in ONE step; Undo brings them back', async () => {
    const { app, ids } = open(() => ({}));
    const region = await k.screen.findByRole('region', { name: 'Review' }, { timeout: 10_000 });
    expect(await k.within(region).findByText('3 records to review')).toBeTruthy();
    const boxes = k.within(region).getAllByRole('checkbox').filter((box) => (box.getAttribute('aria-label') ?? '').startsWith('Select '));
    k.fireEvent.click(boxes[0] as HTMLElement);
    k.fireEvent.click(boxes[1] as HTMLElement);
    k.fireEvent.click(k.within(region).getByRole('button', { name: 'Mark verified (2)' }));
    const done = ids.filter((id) => reviewOf(app, id).status === 'verified');
    expect(done).toHaveLength(2);
    for (const id of done) expect(reviewOf(app, id).reviewedAt).toBe(NOW);
    expect(await k.within(region).findByText('1 record to review')).toBeTruthy();
    k.fireEvent.click(k.within(document.querySelector('header') as HTMLElement).getByRole('button', { name: 'Undo mark verified (2)' }));
    expect(ids.filter((id) => reviewOf(app, id).status === 'unreviewed')).toHaveLength(3);
    expect(await k.within(region).findByText('3 records to review')).toBeTruthy();
  });

  it('a record with an ERROR is refused in words; one with a warning asks first; nothing changes before Mark verified', async () => {
    const { app, ids } = open(() => ({ error: 'The formula does not match the structure', warning: 'The charge looks unusual' }));
    const region = await k.screen.findByRole('region', { name: 'Review' }, { timeout: 10_000 });
    await k.within(region).findByText('3 records to review');
    k.fireEvent.click(k.within(region).getByRole('button', { name: 'Select all shown' }));
    k.fireEvent.click(k.within(region).getByRole('button', { name: 'Mark verified (3)' }));
    const dialog = await k.screen.findByRole('dialog', { name: 'Mark verified' });
    expect(k.within(dialog).getByRole('list', { name: 'Not verified: these have an error' }).textContent).toContain('The formula does not match the structure');
    expect(k.within(dialog).getByRole('list', { name: 'Verified with warnings' }).textContent).toContain('The charge looks unusual');
    expect(ids.every((id) => reviewOf(app, id).status === 'unreviewed')).toBe(true);
    k.fireEvent.click(k.within(dialog).getByRole('button', { name: 'Mark verified (2)' }));
    expect(ids.filter((id) => reviewOf(app, id).status === 'verified')).toHaveLength(2);
    expect(reviewOf(app, ids[0] as string).status).toBe('unreviewed');
  });
});
