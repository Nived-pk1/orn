// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider, ToastRegion } from '@/ui/primitives';
import { RecordMenu } from './record-menu';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  const proto = Element.prototype as unknown as { hasPointerCapture?: () => boolean; scrollIntoView?: () => void; releasePointerCapture?: () => void };
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = (): void => {
  const trigger = screen.getByRole('button', { name: 'Record menu' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
};
const view = (report?: { address: string; version: string }) =>
  render(
    <ToastProvider>
      <RecordMenu refOf={{ kind: 'reaction', id: 'rxn_1' }} name="Aldol" kindWord="Reaction" {...(report === undefined ? {} : { report })} />
      <ToastRegion />
    </ToastProvider>,
  );

describe('RecordMenu (step 8.4g, G1 and G6)', () => {
  it('copies the full address of the record and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    view();
    open();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(`${location.origin}${location.pathname}#/reactions/rxn_1`);
    expect((await screen.findAllByText('Link copied')).length).toBeGreaterThan(0);
  });

  it('says so when the link cannot be copied', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('no')) } });
    view();
    open();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy link' }));
    expect((await screen.findAllByText('The link could not be copied')).length).toBeGreaterThan(0);
  });

  it('shows Report a mistake as a mail link only when an address is set', async () => {
    view({ address: 'a@b.test', version: '0.1.0' });
    open();
    const item = await screen.findByRole('menuitem', { name: 'Report a mistake' });
    expect(item.closest('a')?.getAttribute('href') ?? item.getAttribute('href')).toMatch(/^mailto:a@b\.test\?subject=ORN%3A%20mistake%20in%20Aldol/);
  });

  it('leaves the item out when the address is empty', async () => {
    view({ address: '', version: '0.1.0' });
    open();
    await screen.findByRole('menuitem', { name: 'Copy link' });
    expect(screen.queryByRole('menuitem', { name: 'Report a mistake' })).toBeNull();
  });
});
