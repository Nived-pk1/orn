import { describe, expect, it } from 'vitest';
import { createEventLog, createStatusStore } from './status';
import { checkStorageAtBoot } from './storage-check';

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

function rig(persisted: (() => Promise<boolean>) | undefined, over: { hasData?: boolean; writer?: boolean } = {}) {
  const status = createStatusStore(() => undefined);
  const log = createEventLog(() => 0);
  const storage = persisted === undefined ? { persist: () => Promise.resolve(true) } : { persist: () => Promise.resolve(true), persisted };
  checkStorageAtBoot({ env: { storage }, status, log, hasData: over.hasData ?? true, writer: over.writer ?? true });
  return { status, log };
}

describe('the storage check at boot (step 5.5d, item k)', () => {
  it('not persistent: the same answer as a refusal, with its words, and a log line', async () => {
    const { status, log } = rig(() => Promise.resolve(false));
    await settle();
    expect(status.get().storage).toMatchObject({ persistence: 'refused' });
    expect(status.get().storage.message).toMatch(/has not made this storage persistent/);
    expect(log.get().some((e) => e.event.type === 'persistent_storage')).toBe(true);
  });

  it('persistent: persisted, no message', async () => {
    const { status } = rig(() => Promise.resolve(true));
    await settle();
    expect(status.get().storage).toEqual({ persistence: 'persisted', message: null });
  });

  it('asks nothing without data, without the writer, or when the environment cannot answer; a failing question changes nothing', async () => {
    let asked = 0;
    const question = (): Promise<boolean> => (asked += 1, Promise.resolve(false));
    for (const over of [{ hasData: false }, { writer: false }]) {
      const { status } = rig(question, over);
      await settle();
      expect(status.get().storage.persistence).toBe('unknown');
    }
    expect(asked).toBe(0);
    expect(rig(undefined).status.get().storage.persistence).toBe('unknown');
    const failing = rig(() => Promise.reject(new Error('blocked')));
    await settle();
    expect(failing.status.get().storage.persistence).toBe('unknown');
  });

  it('an answer that arrived first (the request after an import) is not overwritten', async () => {
    const status = createStatusStore(() => undefined);
    const log = createEventLog(() => 0);
    let answer: ((value: boolean) => void) | undefined;
    checkStorageAtBoot({ env: { storage: { persist: () => Promise.resolve(true), persisted: () => new Promise<boolean>((resolve) => (answer = resolve)) } }, status, log, hasData: true, writer: true });
    status.update({ storage: { persistence: 'persisted', message: null } });
    answer?.(false);
    await settle();
    expect(status.get().storage.persistence).toBe('persisted');
  });
});
