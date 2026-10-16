import { describe, expect, it, vi } from 'vitest';
import { createStatusStore, INITIAL_STATUS, type AppStatus } from '@/app/services';
import { createNavigatorPorts, type NavigatorPortServices } from './navigator-port';

/** The `recovered` hook of the navigator's depictions port (step 5.5d, item i): it fires when the chem engine is ready again after it was unavailable. */
function rig() {
  const status = createStatusStore(() => undefined);
  const services = { status, store: {}, indexes: {}, layout: {}, logApp: () => undefined, depictions: {} } as unknown as NavigatorPortServices;
  const ports = createNavigatorPorts(services, { measure: () => ({ width: 1 }), ready: () => Promise.resolve() } as never, { after: () => () => undefined }, { stores: {}, status: {} } as never);
  const listener = vi.fn();
  const off = ports.depictions?.recovered?.(listener) ?? (() => undefined);
  const chem = (state: AppStatus['engines']['chem']['state']): void => void status.update({ engines: { ...INITIAL_STATUS.engines, chem: { state, message: null } } });
  return { listener, off, chem };
}

describe('depictions.recovered', () => {
  it('fires once when the chem engine becomes ready after it was unavailable (a Retry that worked)', () => {
    const { listener, chem } = rig();
    chem('loading');
    chem('ready');
    expect(listener).not.toHaveBeenCalled(); // a first load is not a recovery
    chem('unavailable');
    chem('loading');
    expect(listener).not.toHaveBeenCalled();
    chem('ready');
    expect(listener).toHaveBeenCalledTimes(1);
    chem('cold');
    chem('ready');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a failed Retry fires nothing; the next one that works fires once; unsubscribing stops it', () => {
    const { listener, off, chem } = rig();
    chem('unavailable');
    chem('loading');
    chem('unavailable');
    expect(listener).not.toHaveBeenCalled();
    chem('loading');
    chem('ready');
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    chem('unavailable');
    chem('ready');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('depictions.enginePending / engineReady (phone mode B, part 1)', () => {
  function engineRig() {
    const status = createStatusStore(() => undefined);
    const services = { status, store: {}, indexes: {}, layout: {}, logApp: () => undefined, depictions: {} } as unknown as NavigatorPortServices;
    const ports = createNavigatorPorts(services, { measure: () => ({ width: 1 }), ready: () => Promise.resolve() } as never, { after: () => () => undefined }, { stores: {}, status: {} } as never);
    const chem = (state: AppStatus['engines']['chem']['state']): void => void status.update({ engines: { ...INITIAL_STATUS.engines, chem: { state, message: null } } });
    return { depictions: ports.depictions, chem };
  }

  it('pending while cold or loading; not pending when ready or unavailable', () => {
    const { depictions, chem } = engineRig();
    expect(depictions?.enginePending?.()).toBe(true);
    chem('loading');
    expect(depictions?.enginePending?.()).toBe(true);
    chem('ready');
    expect(depictions?.enginePending?.()).toBe(false);
    chem('unavailable');
    expect(depictions?.enginePending?.()).toBe(false);
  });

  it('fires at every move to ready (the first load too), not on other changes, and stops after the unsubscribe', () => {
    const { depictions, chem } = engineRig();
    const listener = vi.fn();
    const off = depictions?.engineReady?.(listener) ?? (() => undefined);
    chem('loading');
    expect(listener).not.toHaveBeenCalled();
    chem('ready');
    expect(listener).toHaveBeenCalledTimes(1);
    chem('ready');
    expect(listener).toHaveBeenCalledTimes(1);
    chem('cold');
    chem('ready');
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    chem('cold');
    chem('ready');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
