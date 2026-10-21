/**
 * The lazy draft manager (entry room, exams step part A): the real manager is a separate chunk, loaded by the scheduler after the first
 * paint. Until then it answers "starting" and a count of null; afterwards it is the real manager.
 */
import { describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { createIdFactory } from '@/core/dataset';
import { demoState } from '@/test-support/app-boot-kit';
import { createLazyDraftManager } from './lazy-drafts';
import { createEventLog, createStatusStore } from './status';

function rig() {
  const jobs: (() => void)[] = [];
  const store = createCanonicalStore({ initial: demoState(), revision: 0, validateInitial: false });
  const status = createStatusStore(() => undefined);
  status.update({ mode: 'writer', stage: 'ready' });
  const ids = createIdFactory({ nowMs: () => 1_790_000_000_000 }, { next: () => 0.25 });
  const manager = createLazyDraftManager({ store, adapter: undefined, status, timers: { after: (_ms, run) => (jobs.push(run), () => undefined) }, ids, log: createEventLog(() => 0) });
  return { manager, jobs };
}

describe('createLazyDraftManager', () => {
  it('before the scheduler runs: opening says it is starting, the count is not known', () => {
    const { manager } = rig();
    const answer = manager.open({ kind: 'species', blank: true });
    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.reason).toBe('starting');
    expect(manager.view().count).toBeNull();
    expect(manager.entry('x')).toBeUndefined();
  });

  it('start() schedules ONE load; after it runs the manager opens a draft and tells its listeners', async () => {
    const { manager, jobs } = rig();
    let heard = 0;
    manager.subscribe(() => (heard += 1));
    manager.start();
    manager.start();
    expect(jobs.length).toBe(1);
    jobs[0]?.();
    await manager.refresh();
    expect(heard).toBeGreaterThan(0);
    const answer = manager.open({ kind: 'species', blank: true });
    expect(answer.ok).toBe(true);
    expect(manager.view().count).toBe(0);
  });

  it('refresh() loads at once (a caller that awaits it gets the real manager)', async () => {
    const { manager } = rig();
    await manager.refresh();
    expect(manager.open({ kind: 'class', blank: true }).ok).toBe(true);
  });

  it('dispose before the load leaves nothing running', async () => {
    const { manager, jobs } = rig();
    manager.start();
    manager.dispose();
    jobs[0]?.();
    await manager.flush();
    expect(manager.open({ kind: 'species', blank: true }).ok).toBe(false);
  });
});
