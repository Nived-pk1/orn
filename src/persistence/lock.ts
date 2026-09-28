/**
 * The writer lock port (INV-28). Until step 3.4 brings the Web Locks implementation and the change channel, boot
 * runs with this stub, which always grants the lock: every tab believes it is the writer.
 */
import type { WriterLock } from './contracts';

export const alwaysGrantedLock: WriterLock = {
  acquire: () => Promise.resolve('acquired'),
  release: () => Promise.resolve(),
};
