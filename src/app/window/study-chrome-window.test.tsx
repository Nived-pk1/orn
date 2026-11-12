// @vitest-environment jsdom
/**
 * What the window shows a student (step 8.3, C1, C4, C5): Study has no status bar, no "Dataset" in the rail, no "Unanchored reactions" button, the
 * rail says "Map" and the exam select says "Exam" / "All exams"; Studio shows every piece. Both editions are loaded once, as in edition-window.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type Edition = 'study' | 'studio';

async function load(edition: Edition) {
  vi.resetModules();
  vi.stubGlobal('__ORN_EDITION__', edition);
  const rtl = await import('@testing-library/react');
  const kit = await import('@/test-support/window-kit');
  const { demoState } = await import('@/test-support/app-boot-kit');
  const { fakeLayout } = await import('@/test-support/inspector-kit');
  const { PHONE_QUERIES } = await import('@/ui/hooks');
  kit.stubDialog();
  fakeLayout();
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  return { ...rtl, ...kit, demoState, PHONE_QUERIES };
}
type Loaded = Awaited<ReturnType<typeof load>>;
const loaded = { study: await load('study'), studio: await load('studio') };
afterEach(() => {
  loaded.study.cleanup();
  loaded.studio.cleanup();
  vi.unstubAllGlobals();
});

function show(k: Loaded) {
  const app = k.fakeApp({ state: k.demoState(), navigator: { depictions: true } });
  k.renderWithApp(app);
  return app;
}
const asPhone = (k: Loaded) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === k.PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));

describe("desktop", () => {
  it("study: no status bar, no Dataset in the rail, the rail says Map, no Unanchored button, the exam chip says Exam: All exams", async () => {
    const k = loaded.study;
    show(k);
    const rail = k.within(k.screen.getByRole('navigation', { name: 'Modes' }));
    expect(rail.queryByText('Dataset')).toBeNull();
    expect(rail.getByText('Map')).toBeTruthy();
    expect(rail.queryByText('Navigator')).toBeNull();
    expect(k.screen.queryByRole('contentinfo')).toBeNull();
    expect(k.screen.queryByText(/Findings: E/)).toBeNull();
    expect(
      k.screen.queryByRole("button", { name: /Unanchored reactions/ }),
    ).toBeNull();
    expect(
      k.screen.getByRole("button", { name: "Exam: All exams" }),
    ).toBeTruthy(); // the exam chip (step 8.4f, L1)
  });
  it('studio: the status bar, Dataset, Unanchored reactions, and the same Map / Exam words', async () => {
    const k = loaded.studio;
    show(k);
    const rail = k.within(k.screen.getByRole("navigation", { name: "Modes" }));
    expect(rail.getByText("Dataset")).toBeTruthy();
    expect(rail.getByText("Map")).toBeTruthy();
    expect(
      k.within(k.screen.getByRole("contentinfo")).getByText(/Findings: E/),
    ).toBeTruthy();
    await k.screen.findByRole("group", { name: /^Navigator:/ });
    k.fireEvent.pointerDown(k.screen.getByRole("button", { name: "More" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      await k.screen.findByRole("menuitem", { name: /Unanchored reactions/ }),
    ).toBeTruthy();
    expect(
      k.screen.getByRole("button", { name: "Exam: All exams" }),
    ).toBeTruthy(); // the exam chip (step 8.4f, L1)
  });
});

describe('phone', () => {
  it('study: no "n notices" bar when nothing is for the visitor, no Dataset counts or Status in More, the exam select labelled Exam', async () => {
    const k = loaded.study;
    asPhone(k);
    show(k);
    expect(k.screen.queryByText(/\d+ notices?/)).toBeNull();
    k.fireEvent.click(k.screen.getByRole('button', { name: 'More' }));
    expect(k.screen.queryByRole('region', { name: 'Dataset' })).toBeNull();
    expect(k.screen.queryByRole('button', { name: 'Status' })).toBeNull();
    expect(k.screen.getByRole('region', { name: 'Exam' })).toBeTruthy();
  });
  it('studio: More still has Exam, Dataset and Status', async () => {
    const k = loaded.studio;
    asPhone(k);
    show(k);
    k.fireEvent.click(k.screen.getByRole('button', { name: 'More' }));
    expect(k.screen.getByRole('region', { name: 'Dataset' })).toBeTruthy();
    expect(k.screen.getByRole('button', { name: 'Status' })).toBeTruthy();
    expect(k.screen.getByRole('region', { name: 'Exam' })).toBeTruthy();
  });
});
