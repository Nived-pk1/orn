// @vitest-environment jsdom
/**
 * The Study edition's shipped dataset in the real window (studio step E4), both editions loaded once at collection (see
 * `edition-window.test.tsx`). First run: "Load the study dataset" when one is published, the demo words when not. The update notice
 * (Study only): shown at boot when the published sha256 differs from the one this browser last loaded (and there is data to replace);
 * "Load it" runs the existing replace import (replace_all, the same preview and apply flows, so its snapshot and Undo import) and
 * remembers the new sha256; "Later" hides it for this visit only. The Studio edition NEVER shows it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type Edition = 'study' | 'studio';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const NOTICE = 'A newer version of the study dataset is available. Load it (this replaces the data in this browser; export a backup first if you imported your own data).';
const APPLIED = { ok: true, revision: 1, snapshotId: 's', report: {}, reportSaved: true, saved: true, sessionOnly: false, save: null, inProcess: false, notes: [] };

async function load(edition: Edition) {
  vi.resetModules();
  vi.stubGlobal('__ORN_EDITION__', edition);
  const rtl = await import('@testing-library/react');
  const kit = await import('@/test-support/window-kit');
  const { demoState } = await import('@/test-support/app-boot-kit');
  const { fakeLayout } = await import('@/test-support/inspector-kit');
  const { PHONE_QUERIES } = await import('@/ui/hooks');
  const { AppProvider } = await import('@/app/window/context');
  const { Window } = await import('@/app/window/window');
  kit.stubDialog();
  fakeLayout();
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  return { ...rtl, ...kit, demoState, PHONE_QUERIES, AppProvider, Window };
}
type Loaded = Awaited<ReturnType<typeof load>>;
const loaded = { study: await load('study'), studio: await load('studio') };
afterEach(() => {
  loaded.study.cleanup();
  loaded.studio.cleanup();
  vi.unstubAllGlobals();
});

type Info = { kind: 'demo' } | { kind: 'published'; sha256: string; publishedAt: string; loadedSha256: string | undefined; remember: (sha: string) => void };
const published = (loadedSha256: string | undefined, remember = vi.fn()): Info => ({ kind: 'published', sha256: SHA_B, publishedAt: '2026-10-21T09:30:00.000Z', loadedSha256, remember });

function show(k: Loaded, dataset: Info | undefined, options: { withData?: boolean } = {}) {
  const app = k.fakeApp(options.withData === true ? { state: k.demoState() } : {});
  app.flows.preview.mockResolvedValue({ ok: true, plan: k.planOf(), inProcess: false });
  app.flows.apply.mockResolvedValue(APPLIED);
  k.render(
    <k.AppProvider value={{ ...app.value, ...(dataset === undefined ? {} : { dataset }) }}>
      <k.Window />
    </k.AppProvider>,
  );
  return app;
}
const asPhone = (k: Loaded) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === k.PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));

describe('first run', () => {
  it('study, published: "Load the study dataset" (not the demo words); it runs the import and remembers the sha256', async () => {
    const k = loaded.study;
    const remember = vi.fn();
    const app = show(k, published(undefined, remember));
    expect(k.screen.queryByRole('button', { name: 'Load demo dataset' })).toBeNull();
    k.fireEvent.click(k.screen.getByRole('button', { name: 'Load the study dataset' }));
    await k.waitFor(() => expect(app.flows.apply).toHaveBeenCalled());
    expect(app.flows.preview.mock.calls[0]?.[2]).toEqual({ mode: 'replace_all' });
    await k.waitFor(() => expect(remember).toHaveBeenCalledWith(SHA_B));
  });

  it('a refused load does not remember anything', async () => {
    const k = loaded.study;
    const remember = vi.fn();
    const app = show(k, published(undefined, remember));
    app.flows.apply.mockResolvedValue({ ok: false, code: 'BLOCKED', message: 'no' });
    k.fireEvent.click(k.screen.getByRole('button', { name: 'Load the study dataset' }));
    await k.waitFor(() => expect(app.flows.apply).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(remember).not.toHaveBeenCalled();
  });

  it('study, nothing published (the demo): the demo words as today, and no notice', () => {
    const k = loaded.study;
    show(k, { kind: 'demo' });
    expect(k.screen.getByRole('button', { name: 'Load demo dataset' })).toBeTruthy();
    show(k, undefined);
    expect(k.screen.queryByText(NOTICE)).toBeNull();
  });

  it('studio: always the demo words, even if it were handed a published dataset', () => {
    const k = loaded.studio;
    show(k, published(undefined));
    expect(k.screen.getByRole('button', { name: 'Load demo dataset' })).toBeTruthy();
    expect(k.screen.queryByRole('button', { name: 'Load the study dataset' })).toBeNull();
  });
});

describe('the update notice (Study only)', () => {
  it('shown when the published sha256 differs from the last loaded one: its words, "Load it" and "Later"', () => {
    const k = loaded.study;
    show(k, published(SHA_A), { withData: true });
    const notice = k.screen.getByText(NOTICE);
    expect(notice).toBeTruthy();
    const region = notice.closest('section') as HTMLElement;
    expect(k.within(region).getByRole('button', { name: 'Load it' })).toBeTruthy();
    expect(k.within(region).getByRole('button', { name: 'Later' })).toBeTruthy();
  });

  it('shown too when this browser never loaded one (it holds data and a study dataset exists)', () => {
    const k = loaded.study;
    show(k, published(undefined), { withData: true });
    expect(k.screen.getByText(NOTICE)).toBeTruthy();
  });

  it('NOT shown when the sha256 is the same', () => {
    const k = loaded.study;
    show(k, published(SHA_B), { withData: true });
    expect(k.screen.queryByText(NOTICE)).toBeNull();
  });

  it('"Load it": the existing replace import (replace_all, preview then apply), the sha256 remembered, the notice gone, Undo import offered', async () => {
    const k = loaded.study;
    const remember = vi.fn();
    const app = show(k, published(SHA_A, remember), { withData: true });
    k.fireEvent.click(k.screen.getByRole('button', { name: 'Load it' }));
    await k.waitFor(() => expect(app.flows.apply).toHaveBeenCalledWith('batch-1', expect.objectContaining({ mode: 'replace_all' }), expect.anything()));
    expect(app.loadDemo).toHaveBeenCalledTimes(1);
    expect(app.flows.preview.mock.calls[0]?.[2]).toEqual({ mode: 'replace_all' });
    await k.waitFor(() => expect(remember).toHaveBeenCalledWith(SHA_B));
    await k.waitFor(() => expect(k.screen.queryByText(NOTICE)).toBeNull());
    expect(await k.screen.findByRole('button', { name: 'Undo import' })).toBeTruthy();
  });

  it('"Later": hidden for this visit, asked again at the next one (a fresh window)', () => {
    const k = loaded.study;
    const info = published(SHA_A);
    show(k, info, { withData: true });
    k.fireEvent.click(k.screen.getByRole('button', { name: 'Later' }));
    expect(k.screen.queryByText(NOTICE)).toBeNull();
    k.cleanup();
    show(k, info, { withData: true });
    expect(k.screen.getByText(NOTICE)).toBeTruthy();
  });

  it('on a phone it is one of the folded notices', () => {
    const k = loaded.study;
    asPhone(k);
    show(k, published(SHA_A), { withData: true });
    k.fireEvent.click(k.screen.getByRole('button', { name: /notice/ }));
    expect(k.screen.getByText(NOTICE)).toBeTruthy();
  });

  it('studio: NEVER shown (the owner\'s working copy is never replaced by a prompt), whatever the sha256s', () => {
    const k = loaded.studio;
    show(k, published(SHA_A), { withData: true });
    expect(k.screen.queryByText(NOTICE)).toBeNull();
    k.cleanup();
    show(k, published(undefined), { withData: true });
    expect(k.screen.queryByText(NOTICE)).toBeNull();
  });
});

describe('the dataset view words follow the dataset', () => {
  it('study, published: "Replace with the study dataset"; demo: unchanged', () => {
    const k = loaded.study;
    show(k, published(SHA_B), { withData: true });
    k.fireEvent.click(k.screen.getByRole('button', { name: /Dataset/ }));
    expect(k.screen.getByRole('button', { name: 'Replace with the study dataset' })).toBeTruthy();
    k.cleanup();
    show(k, { kind: 'demo' }, { withData: true });
    k.fireEvent.click(k.screen.getByRole('button', { name: /Dataset/ }));
    expect(k.screen.getByRole('button', { name: 'Replace with the demo dataset' })).toBeTruthy();
  });
});
