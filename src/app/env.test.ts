import { describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { APP_NAME, createBrowserEnv } from './env';

const crypto = { getRandomValues: (a: Uint32Array) => a.fill(2_147_483_648) } as unknown as Crypto;

describe('createBrowserEnv', () => {
  it('passes the browser objects it is given and builds the four worker factories', () => {
    const indexedDB = new IDBFactory();
    const locks = { request: vi.fn() };
    const persist = vi.fn(() => Promise.resolve(true));
    const Channel = vi.fn();
    const env = createBrowserEnv({ indexedDB, IDBKeyRange, locks, BroadcastChannel: Channel as unknown as typeof BroadcastChannel, storage: { persist }, crypto });
    expect(env.indexedDB).toBe(indexedDB);
    expect(env.IDBKeyRange).toBe(IDBKeyRange);
    expect(env.locks).toBe(locks);
    expect(env.storage?.persist).toBe(persist);
    env.channel?.('orn');
    expect(Channel).toHaveBeenCalledWith('orn');
    expect(Object.keys(env.workers).sort()).toEqual(['chem', 'compute', 'layout', 'search']);
    expect(env.generator.app).toBe(APP_NAME);
    expect(env.random.next()).toBe(0.5);
    expect(env.clock.nowMs()).toBeGreaterThan(1_700_000_000_000);
  });

  it('leaves out what the browser does not have (the services then report a status)', () => {
    const env = createBrowserEnv({ crypto });
    expect(env).not.toHaveProperty('indexedDB');
    expect(env).not.toHaveProperty('IDBKeyRange');
    expect(env).not.toHaveProperty('locks');
    expect(env).not.toHaveProperty('channel');
    expect(env).not.toHaveProperty('storage');
  });
});
