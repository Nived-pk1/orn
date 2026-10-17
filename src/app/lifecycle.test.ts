// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { installLifecycle } from './lifecycle';

function rig(pending = false) {
  const services = {
    shutdown: vi.fn(() => Promise.resolve({ written: true as const, at: 't' })),
    resume: vi.fn(() => Promise.resolve({ resumed: true as const })),
    pendingWrites: vi.fn(() => pending),
  };
  const target = new EventTarget();
  const off = installLifecycle(services, target);
  return { services, target, off };
}

describe('installLifecycle', () => {
  it('pagehide calls shutdown()', () => {
    const { services, target } = rig();
    target.dispatchEvent(new Event('pagehide'));
    expect(services.shutdown).toHaveBeenCalledTimes(1);
  });

  it('pageshow with persisted = true calls resume(); a plain pageshow does not', () => {
    const { services, target } = rig();
    target.dispatchEvent(new Event('pageshow'));
    expect(services.resume).not.toHaveBeenCalled();
    target.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(services.resume).not.toHaveBeenCalled();
    target.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(services.resume).toHaveBeenCalledTimes(1);
  });

  it('beforeunload warns only while writes are pending', () => {
    const idle = rig(false);
    const quiet = new Event('beforeunload', { cancelable: true });
    idle.target.dispatchEvent(quiet);
    expect(quiet.defaultPrevented).toBe(false);
    const busy = rig(true);
    const warned = new Event('beforeunload', { cancelable: true });
    busy.target.dispatchEvent(warned);
    expect(warned.defaultPrevented).toBe(true);
  });

  it('the returned function removes every listener', () => {
    const { services, target, off } = rig(true);
    off();
    target.dispatchEvent(new Event('pagehide'));
    target.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    const unload = new Event('beforeunload', { cancelable: true });
    target.dispatchEvent(unload);
    expect(services.shutdown).not.toHaveBeenCalled();
    expect(services.resume).not.toHaveBeenCalled();
    expect(unload.defaultPrevented).toBe(false);
  });
});

describe('installLifecycle: drafts when the page is hidden (ADR-040, best effort)', () => {
  function visibilityRig() {
    const flush = vi.fn(() => Promise.resolve());
    const services = {
      shutdown: vi.fn(() => Promise.resolve({ written: true as const, at: 't' })),
      resume: vi.fn(() => Promise.resolve({ resumed: true as const })),
      pendingWrites: vi.fn(() => false),
      drafts: { flush },
    };
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as string });
    const off = installLifecycle(services, new EventTarget(), doc);
    return { flush, doc, off };
  }

  it('saves dirty drafts when the page becomes hidden, and only then', () => {
    const { flush, doc } = visibilityRig();
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(flush).not.toHaveBeenCalled();
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('the returned function removes the listener', () => {
    const { flush, doc, off } = visibilityRig();
    off();
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(flush).not.toHaveBeenCalled();
  });
});
