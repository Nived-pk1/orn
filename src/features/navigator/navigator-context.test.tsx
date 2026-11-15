// @vitest-environment jsdom
/** The provider starts the map model only once the map has been shown (step 8.4m, R1), and then keeps it. */
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { documentToState } from '@/core/dataset';
import { navigatorRig } from '@/test-support/navigator-kit';
import { NavigatorProvider, useNavigatorState } from './navigator-context';

afterEach(cleanup);
const parsed = documentToState(JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/map-layout/map-layout.orn.json'), 'utf8')));
if (!parsed.ok) throw new Error('fixture');

function Probe() {
  const state = useNavigatorState();
  return <p data-testid="probe">{state.scene === null ? 'not computed' : `${state.hubIds.length} hubs`}</p>;
}

describe('NavigatorProvider: the model waits for the map', () => {
  it('data but the map not shown: no projection, no layout call, readers see "not computed"; once shown it runs and stays', async () => {
    const rig = navigatorRig(createCanonicalStore({ initial: parsed.state, validateInitial: false }));
    const view = render(
      <NavigatorProvider ports={rig.ports} active shown={false}>
        <Probe />
      </NavigatorProvider>,
    );
    await new Promise((done) => setTimeout(done, 50));
    expect(rig.layout.requests).toHaveLength(0);
    expect(rig.indexAsks()).toBe(0);
    expect(view.getByTestId('probe').textContent).toBe('not computed');

    view.rerender(
      <NavigatorProvider ports={rig.ports} active shown>
        <Probe />
      </NavigatorProvider>,
    );
    await vi.waitFor(() => expect(view.getByTestId('probe').textContent).toMatch(/^\d+ hubs$/), { timeout: 10_000 });
    expect(rig.layout.requests.length).toBeGreaterThan(0);

    // leaving the map does not stop the model: a change of its inputs is still followed
    view.rerender(
      <NavigatorProvider ports={rig.ports} active shown={false}>
        <Probe />
      </NavigatorProvider>,
    );
    const before = rig.indexAsks();
    rig.ui.map.setState({ chainOpen: !rig.ui.map.getState().chainOpen });
    await vi.waitFor(() => expect(rig.indexAsks()).toBeGreaterThan(before), { timeout: 10_000 });
  });
});
