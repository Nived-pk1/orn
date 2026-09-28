/**
 * A writer lock that always grants (INV-28 is then the caller's problem): for a session with a single tab by
 * construction, and for tests that are not about locking. The real one is `createWebLocksWriterLock` (`web-locks.ts`).
 */
import type { WriterLock } from './contracts';

export const alwaysGrantedLock: WriterLock = {
  acquire: () => Promise.resolve('acquired'),
  whenAcquired: () => new Promise<void>(() => undefined),
  release: () => Promise.resolve(),
};
