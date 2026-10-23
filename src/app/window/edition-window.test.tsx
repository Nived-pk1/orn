// @vitest-environment jsdom
/**
 * The window in both editions (studio step E1), each loaded with its own build-time literal. Study: no Workbench in the navigation, no
 * Edit button in the inspector, no Drafts item, no start-up drafts line, no global Undo / Redo (the bar, More, the keys), no marker;
 * "Undo import" and everything that is not editing stay. Studio: all of it, plus the "Studio" marker in the header (desktop and phone).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type Edition = 'study' | 'studio';

/** Everything is imported AFTER the literal is set (and after a module reset), so React and the window share one copy. */
async function load(edition: Edition) {
  vi.resetModules();
  vi.stubGlobal('__ORN_EDITION__', edition);
  const rtl = await import('@testing-library/react');
  const kit = await import('@/test-support/window-kit');
  const { demoState } = await import('@/test-support/app-boot-kit');
  const { fakeLayout } = await import('@/test-support/inspector-kit');
  const { PHONE_QUERIES } = await import('@/ui/hooks');
  const { AppProvider } = await import('@/app/window/context');
  const { useDraftsView } = await import('@/app/window/drafts-ui');
  kit.stubDialog();
  fakeLayout();
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  return { ...rtl, ...kit, demoState, PHONE_QUERIES, AppProvider, useDraftsView };
}
/** The top bar: a desktop window has a second banner landmark (the notices region). */
const header = (): HTMLElement => document.querySelector('header') as HTMLElement;
type Loaded = Awaited<ReturnType<typeof load>>;

/** Both editions are loaded ONCE, at collection (a top-level await has no test timeout): each set has its own module registry, React and testing library. */
const loaded = { study: await load('study'), studio: await load('studio') };
afterEach(() => {
  loaded.study.cleanup();
  loaded.studio.cleanup();
  vi.unstubAllGlobals();
});

function show(k: Loaded) {
  const app = k.fakeApp({ state: k.demoState(), navigator: { depictions: true } });
  app.panels.getState().setInspectorOpen(true);
  k.renderWithApp(app);
  const species = Object.keys(app.store.getState().records.species).sort()[0] as string;
  k.act(() => app.inspectorStore.getState().open({ kind: 'species', id: species }));
  return app;
}
const asPhone = (k: Loaded) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === k.PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));

describe('desktop', () => {
  it('study: no Workbench, no Edit, no Undo or Redo, no marker; File has Undo import and no Drafts', async () => {
    const k = loaded.study;
    show(k);
    expect(k.within(k.screen.getByRole('navigation', { name: 'Modes' })).queryByText('Workbench')).toBeNull();
    expect(k.screen.queryByRole('region', { name: 'Workbench' })).toBeNull();
    expect(k.within(k.screen.getByRole('complementary', { name: 'Inspector' })).queryByRole('button', { name: 'Edit' })).toBeNull();
    const banner = header();
    expect(k.within(banner).queryByRole('button', { name: /^Undo$/ })).toBeNull();
    expect(k.within(banner).queryByRole('button', { name: /^Redo$/ })).toBeNull();
    expect(k.within(banner).queryByText('Studio')).toBeNull();
    k.fireEvent.pointerDown(k.within(banner).getByRole('button', { name: 'File' }), { button: 0, ctrlKey: false });
    expect(await k.screen.findByRole('menuitem', { name: 'Undo import' })).toBeTruthy();
    expect(k.screen.queryByRole('menuitem', { name: /^Drafts/ })).toBeNull();
  });

  it('studio: Workbench, Edit, Undo and Redo, the Drafts item and the "Studio" marker are there', async () => {
    const k = loaded.studio;
    show(k);
    expect(k.within(k.screen.getByRole('navigation', { name: 'Modes' })).getByText('Workbench')).toBeTruthy();
    expect(k.within(k.screen.getByRole('complementary', { name: 'Inspector' })).getByRole('button', { name: 'Edit' })).toBeTruthy();
    const banner = header();
    expect(k.within(banner).getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(k.within(banner).getByRole('button', { name: 'Redo' })).toBeTruthy();
    expect(k.within(banner).getByText('Studio')).toBeTruthy();
    k.fireEvent.pointerDown(k.within(banner).getByRole('button', { name: 'File' }), { button: 0, ctrlKey: false });
    expect(await k.screen.findByRole('menuitem', { name: 'Drafts (0)' })).toBeTruthy();
  });

  it('study: no Review page in the navigation; studio: Review opens the queue (step 6.8b)', async () => {
    const study = loaded.study;
    show(study);
    expect(study.within(study.screen.getByRole('navigation', { name: 'Modes' })).queryByText('Review')).toBeNull();
    study.cleanup();
    const k = loaded.studio;
    show(k);
    k.fireEvent.click(k.within(k.screen.getByRole('navigation', { name: 'Modes' })).getByText('Review'));
    const region = await k.screen.findByRole('region', { name: 'Review' }, { timeout: 10_000 });
    expect(k.within(region).getByRole('heading', { name: 'Review' })).toBeTruthy();
    expect(k.within(region).getByRole('button', { name: 'Select all shown' })).toBeTruthy();
  });

  it('study: Ctrl+Z does not touch the history (no key handler)', async () => {
    const k = loaded.study;
    const app = show(k);
    const spy = vi.spyOn(app.store, 'undo');
    k.fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('phone', () => {
  it('study: More has File (with Undo import) and no Workbench, no Undo, no Redo, no Drafts; no marker', async () => {
    const k = loaded.study;
    asPhone(k);
    show(k);
    expect(k.within(header()).queryByText('Studio')).toBeNull();
    k.fireEvent.click(k.screen.getByRole('button', { name: 'More' }));
    const more = k.within(k.screen.getByRole('dialog', { name: 'More' }));
    expect(more.getByRole('button', { name: 'Undo import' })).toBeTruthy();
    expect(more.queryByRole('region', { name: 'Workbench' })).toBeNull();
    expect(more.queryByText(/^New /)).toBeNull();
    expect(more.queryByText('Review')).toBeNull();
    expect(more.queryByRole('button', { name: /^Undo$|^Redo$/ })).toBeNull();
    expect(more.queryByRole('button', { name: /^Drafts/ })).toBeNull();
  });

  it('studio: More has the Workbench, Undo, Redo and Drafts; the header carries "Studio"', async () => {
    const k = loaded.studio;
    asPhone(k);
    show(k);
    expect(k.within(header()).getByText('Studio')).toBeTruthy();
    k.fireEvent.click(k.screen.getByRole('button', { name: 'More' }));
    const more = k.within(k.screen.getByRole('dialog', { name: 'More' }));
    expect(more.getByRole('region', { name: 'Workbench' })).toBeTruthy();
    expect(more.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(more.getByRole('button', { name: /^Drafts/ })).toBeTruthy();
  });
});

describe('the drafts the window shows', () => {
  it('study: drafts already stored in this browser are not shown (the view is empty); studio shows them', async () => {
    for (const edition of ['study', 'studio'] as const) {
      const k = loaded[edition];
      const { AppProvider, useDraftsView } = k;
      const app = k.fakeApp({ state: k.demoState() });
      const stored = { items: [], count: 2, keeping: 'stored' as const };
      const services = { ...app.value.services, drafts: { view: () => stored, subscribe: () => () => undefined } } as unknown as typeof app.value.services;
      let seen: number | null = -1;
      function Probe() {
        seen = useDraftsView().count;
        return null;
      }
      k.render(
        <AppProvider value={{ ...app.value, services }}>
          <Probe />
        </AppProvider>,
      );
      expect(seen, edition).toBe(edition === 'study' ? 0 : 2);
      k.cleanup();
    }
  });
});
