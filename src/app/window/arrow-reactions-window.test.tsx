// @vitest-environment jsdom
/**
 * The reactions of an arrow (ADR-039: a tap on an arrow opens the sheet with that arrow's reactions), at component level on the demo:
 * an arrow of several reactions lists every one of them in the inspector, one reaction is shown as the record itself, and a listed
 * reaction opens in the inspector.
 */
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeApp, renderWithApp, type FakeApp } from '@/test-support/window-kit';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => undefined;
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 4000 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 900 });
  HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 900, bottom: 4000, width: 900, height: 4000, toJSON: () => ({}) });
});
afterEach(cleanup);

async function arrows(): Promise<{ app: FakeApp; rows: { id: string; count: number; row: HTMLElement }[] }> {
  const app = fakeApp({ state: demoState() });
  renderWithApp(app);
  await screen.findByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ });
  fireEvent.click(within(screen.getByRole('toolbar', { name: 'Canvas tools' })).getByRole('button', { name: 'List' }));
  const table = await screen.findByRole('table', { name: 'Arrows' });
  const rows = [...table.querySelectorAll<HTMLElement>('[data-row-key]')].map((row) => ({ id: row.getAttribute('data-row-key') as string, count: Number(within(row).getAllByRole('cell')[2]?.textContent), row }));
  return { app, rows };
}
const pane = (): HTMLElement => screen.getByRole('complementary', { name: 'Inspector' });

describe('the reactions of an arrow in the inspector', () => {
  it('an arrow of several reactions names each of them once (an arrow counts outcomes too, so its chip may be larger)', async () => {
    const { rows } = await arrows();
    const many = rows.find((r) => r.count >= 2);
    expect(many).toBeDefined();
    fireEvent.click((many as { row: HTMLElement }).row);
    const list = within(pane()).getByRole('region', { name: 'Reactions on this arrow' });
    const buttons = within(within(list).getByRole('list')).getAllByRole('button'); // the region also holds "Open these n reactions in Reactions" since 7.1b
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    expect(buttons.length).toBeLessThanOrEqual((many as { count: number }).count);
    expect(new Set(buttons.map((b) => b.textContent)).size).toBe(buttons.length);
    expect(within(list).getByRole('heading', { level: 4 }).textContent).toBe(`Reactions on this arrow (${buttons.length})`);
  });

  it('a listed reaction opens in the inspector', async () => {
    const { rows } = await arrows();
    fireEvent.click((rows.find((r) => r.count >= 2) as { row: HTMLElement }).row);
    const first = within(within(within(pane()).getByRole('region', { name: 'Reactions on this arrow' })).getByRole('list')).getAllByRole('button')[0] as HTMLElement;
    fireEvent.click(first);
    expect(within(pane()).getByRole('article', { name: 'Record' }).getAttribute('data-record-id')).toMatch(/^rxn_/);
    expect(within(pane()).queryByRole('region', { name: 'Reactions on this arrow' })).toBeNull();
  });

  it('an arrow of one reaction is that reaction: no list', async () => {
    const { rows } = await arrows();
    const one = rows.find((r) => r.count === 1);
    expect(one).toBeDefined();
    fireEvent.click((one as { row: HTMLElement }).row);
    expect(within(pane()).getByRole('article', { name: 'Record' }).getAttribute('data-record-id')).toMatch(/^rxn_/);
    expect(within(pane()).queryByRole('region', { name: 'Reactions on this arrow' })).toBeNull();
  });
});
