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

describe('the Structures setting through the port (equation step, part 4)', () => {
  function modeRig() {
    const calls: { mode: string | undefined }[] = [];
    const status = createStatusStore(() => undefined);
    const services = {
      status,
      store: {},
      indexes: {},
      layout: {},
      logApp: () => undefined,
      depictions: { depict: (_s: unknown, _z: unknown, options: { mode?: string }) => (calls.push({ mode: options.mode }), Promise.resolve({ ok: false, key: 'k', reason: 'unavailable', message: 'x' })), cancel: () => undefined },
    } as unknown as NavigatorPortServices;
    let mode: 'skeletal' | 'condensed' | 'full' = 'skeletal';
    const listeners = new Set<() => void>();
    const structures = { mode: () => mode, setMode: (m: typeof mode) => ((mode = m), [...listeners].forEach((l) => l())), subscribe: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)) };
    const ports = createNavigatorPorts(services, { measure: () => ({ width: 1 }), ready: () => Promise.resolve() } as never, { after: () => () => undefined }, { stores: {}, status: {} } as never, structures);
    return { ports, structures, listeners };
  }
  const ethanol = { format: 'smiles', value: 'CCO' } as never;

  it('the keys carry the mode (three modes, three keys), and a drawing is asked in the mode it was asked in', async () => {
    const { ports } = modeRig();
    const keys = (['skeletal', 'condensed', 'full'] as const).map((mode) => ports.depictions?.keyOf(ethanol, { width: 128, height: 80 }, mode));
    expect(new Set(keys).size).toBe(3);
    expect(ports.depictions?.keyOf(ethanol, { width: 128, height: 80 })).toBe(keys[0]);
  });

  it('`mode` and `onMode` follow the setting; `onMode` fires only when the mode itself changes', () => {
    const { ports, structures } = modeRig();
    const heard = vi.fn();
    const off = ports.depictions?.onMode?.(heard) ?? (() => undefined);
    expect(ports.depictions?.mode?.()).toBe('skeletal');
    structures.setMode('condensed');
    expect(heard).toHaveBeenCalledTimes(1);
    expect(ports.depictions?.mode?.()).toBe('condensed');
    structures.setMode('condensed'); // the same: not a change
    expect(heard).toHaveBeenCalledTimes(1);
    off();
    structures.setMode('full');
    expect(heard).toHaveBeenCalledTimes(1);
    expect(ports.structures?.mode()).toBe('full');
  });

  it('without a setting the port is skeletal and never calls', () => {
    const status = createStatusStore(() => undefined);
    const services = { status, store: {}, indexes: {}, layout: {}, logApp: () => undefined, depictions: {} } as unknown as NavigatorPortServices;
    const ports = createNavigatorPorts(services, { measure: () => ({ width: 1 }), ready: () => Promise.resolve() } as never, { after: () => () => undefined }, { stores: {}, status: {} } as never);
    expect(ports.depictions?.mode?.()).toBe('skeletal');
    expect(ports.structures).toBeUndefined();
  });
});
