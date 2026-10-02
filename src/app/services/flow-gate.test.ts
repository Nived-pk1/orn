import { describe, expect, it } from 'vitest';
import { createFlowGate, isRefusal } from './flow-gate';
import { createEventLog, createStatusStore } from './status';

const rig = () => {
  const status = createStatusStore(() => undefined);
  const log = createEventLog(() => 0);
  return { status, log, gate: createFlowGate(status, log) };
};

describe('the flow gate', () => {
  it('hands out one slot: a second begin is BUSY with what runs, logged, and the status is untouched', () => {
    const { gate, status, log } = rig();
    const first = gate.begin('import_apply', 'preparing');
    if (isRefusal(first)) throw new Error('refused');
    const shown = status.get();
    const second = gate.begin('restore', 'reading');
    expect(second).toMatchObject({ ok: false, code: 'BUSY', busyWith: 'import_apply' });
    expect(status.get()).toBe(shown);
    expect(log.get().filter((entry) => entry.event.type === 'flow_busy')).toHaveLength(1);
    expect(gate.running()).toBe('import_apply');
    first.end();
    expect(gate.running()).toBeUndefined();
    expect(isRefusal(gate.begin('restore', 'reading'))).toBe(false);
  });

  it('shows kind, stage and progress; end is idempotent and a late update after end shows nothing', () => {
    const { gate, status } = rig();
    const op = gate.begin('export', 'exporting');
    if (isRefusal(op)) throw new Error('refused');
    expect(status.get().operation).toEqual({ kind: 'export', stage: 'exporting', progress: null });
    op.progress(2, 5);
    expect(status.get().operation).toEqual({ kind: 'export', stage: 'exporting', progress: { done: 2, total: 5 } });
    op.stage('saving');
    expect(status.get().operation).toEqual({ kind: 'export', stage: 'saving', progress: null });
    op.end();
    op.end();
    op.stage('too late');
    expect(status.get().operation).toBeNull();
  });
});
