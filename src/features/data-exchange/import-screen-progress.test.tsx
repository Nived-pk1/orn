// @vitest-environment jsdom
// Step 5.11b: the long-wait view of an apply: the bar, its ARIA values, the texts, nothing under 2 s, one announcement, no Cancel.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fakeLayout } from '@/test-support/inspector-kit';
import { APPLIED_OK, fakePorts, plan } from '@/test-support/data-exchange-kit';
import { stubDialog } from '@/test-support/window-kit';
import { ToastProvider } from '@/ui/primitives';
import type { PaceClock } from './apply-pace';
import { createImportModel } from './import-model';
import { ImportScreen } from './import-screen';

beforeAll(() => {
  stubDialog();
  fakeLayout();
});
afterEach(cleanup);

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await act(async () => Promise.resolve());
};

function manualClock() {
  let now = 0;
  let timers: { at: number; run: () => void; live: boolean }[] = [];
  const clock: PaceClock = {
    now: () => now,
    after(run, ms) {
      const timer = { at: now + ms, run, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
  };
  const advance = (ms: number): void => {
    const target = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.live && t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (due === undefined) break;
      due.live = false;
      now = due.at;
      act(() => due.run());
    }
    now = target;
    timers = timers.filter((t) => t.live);
  };
  return { clock, advance };
}

async function applying() {
  const ports = fakePorts();
  const time = manualClock();
  ports.preview.mockResolvedValue({ ok: true, plan: plan(), inProcess: false });
  let release: (value: unknown) => void = () => undefined;
  ports.apply.mockImplementation(() => new Promise((resolve) => (release = resolve)));
  const model = createImportModel(ports, { clock: time.clock });
  render(
    <ToastProvider>
      <ImportScreen model={model} ports={ports} />
    </ToastProvider>,
  );
  act(() => model.openFile(new File(['{}'], 'big.orn.json')));
  await settle();
  act(() => model.confirm());
  const report = (stage: string, done: number | null, total = 500): void =>
    act(() => ports.setOperation({ kind: 'import_apply', stage, progress: done === null ? null : { done, total } }));
  return { ports, model, time, report, release: (v: unknown) => release(v) };
}

describe('the long apply view (5.11b)', () => {
  it('shows nothing extra under 2 s, even with the writer reporting', async () => {
    const { time, report } = await applying();
    report('committing', null);
    report('committing', 96);
    time.advance(1999);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/Keep this tab open/)).toBeNull();
    expect(screen.queryByText(/of 500/)).toBeNull();
    expect(screen.getByText(/Applying the records…/)).toBeTruthy();
  });

  it('after 2 s: the texts, a progressbar with its ARIA values, the newest count; no Cancel', async () => {
    const { time, report } = await applying();
    report('committing', 96);
    time.advance(2000);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('500');
    expect(bar.getAttribute('aria-valuenow')).toBe('96');
    expect(screen.getByText('Applying the records... 96 of 500')).toBeTruthy();
    expect(screen.getByText('Keep this tab open until it finishes.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    report('committing', 128);
    time.advance(250);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('128');
    expect(screen.getByText('Applying the records... 128 of 500')).toBeTruthy();
  });

  it('a new stage (progress null) does not take the count away, and the count never goes down', async () => {
    const { time, report } = await applying();
    report('committing', 200);
    time.advance(2000);
    report('saving', null);
    report('saving', 100);
    time.advance(1000);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('200');
  });

  it('the live region does not carry the moving count: the bar and its text sit outside any status region', async () => {
    const { time, report } = await applying();
    report('committing', 64);
    time.advance(2000);
    const live = screen.getAllByRole('status');
    for (const region of live) {
      expect(region.contains(screen.getByRole('progressbar'))).toBe(false);
      expect(region.textContent).not.toMatch(/of 500/);
    }
    expect(live.some((region) => /Keep this tab open until it finishes\./.test(region.textContent ?? ''))).toBe(true);
    const announced = live.map((region) => region.textContent);
    report('committing', 160);
    time.advance(250);
    expect(screen.getAllByRole('status').map((region) => region.textContent)).toEqual(announced);
  });

  it('before the writer reports, a long wait keeps the stage line (and Cancel while it still changes nothing)', async () => {
    const { time, report } = await applying();
    report('snapshot', null);
    time.advance(3000);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText(/Taking a snapshot so the import can be undone/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('ends in "Imported" and the view is gone; N equals M at the end', async () => {
    const { model, time, report, release } = await applying();
    report('committing', 400);
    time.advance(2000);
    report('committing', 500);
    time.advance(10);
    release(APPLIED_OK);
    await settle();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(model.store.getState().notice).toMatchObject({ kind: 'info', text: 'Imported 5 records from big.orn.json.' });
  });

  it('a failed apply shows the refusal, never "Imported"', async () => {
    const { time, report, release } = await applying();
    report('committing', 96);
    time.advance(2000);
    release({ ok: false, code: 'REJECTED', message: 'disk fault in slice 3' });
    await settle();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/^Imported/)).toBeNull();
    expect(screen.getByRole('alert').textContent).toMatch(/nothing was imported/);
  });
});
