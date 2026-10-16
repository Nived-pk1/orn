// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createDepictionManager, type DepictionAnswer } from '@/render/svg';
import { manualTimers } from '@/test-support/navigator-kit';
import { FamilyEnvContext } from './family-env';
import { Structure } from './family-structure';

afterEach(cleanup);

const CARD = { kind: 'species', id: 'sp-ethanol' } as never;

function rig(answer: () => Promise<DepictionAnswer>, isPending: () => boolean) {
  const timers = manualTimers();
  const manager = createDepictionManager({
    fetchSvg: answer,
    createUrl: () => 'blob:drawn',
    revokeUrl: () => undefined,
    setTimer: (cb, ms) => timers.after(ms, cb),
    clearTimer: (h) => (h as () => void)(),
    isPending,
  });
  const env = { describe: () => ({ name: 'Ethanol', formula: 'C2H6O' }), keyOf: () => 'key-a', manager, timers };
  const view = render(
    <FamilyEnvContext.Provider value={env}>
      <Structure substance={CARD} />
    </FamilyEnvContext.Provider>,
  );
  return { timers, manager, view };
}

describe('Structure card while the chem engine is not ready (phone mode B, part 1)', () => {
  it('keeps its name and formula and says "Drawing the structure…", with no error look, when the request failed only because the engine was not ready', async () => {
    rig(() => Promise.resolve({ ok: false, reason: 'unavailable' }), () => true);
    expect(await screen.findByText('Drawing the structure…')).toBeTruthy();
    expect(screen.getByText('Ethanol')).toBeTruthy();
    expect(document.querySelector('[title="The structure could not be drawn"]')).toBeNull();
    expect(screen.queryByText('Structure not available')).toBeNull();
  });

  it('draws the structure by itself when the engine becomes ready (no reopening)', async () => {
    let ready = false;
    const r = rig(() => Promise.resolve(ready ? { ok: true, svg: '<svg/>' } : { ok: false, reason: 'unavailable' }), () => !ready);
    await screen.findByText('Drawing the structure…');
    ready = true;
    await act(async () => void r.manager.forgetNotReady());
    await act(async () => {
      r.timers.advance(250);
      await Promise.resolve();
    });
    expect((await screen.findByRole('img', { name: 'Structure of Ethanol' })).getAttribute('src')).toBe('blob:drawn');
  });

  it('a failure while the engine is ready keeps the error look (the title says so)', async () => {
    rig(() => Promise.resolve({ ok: false, reason: 'invalid' }), () => false);
    await screen.findByText('Ethanol');
    expect(await screen.findByTitle('The structure could not be drawn')).toBeTruthy();
    expect(screen.queryByText('Drawing the structure…')).toBeNull();
  });
});
