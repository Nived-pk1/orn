/**
 * One whole-state operation at a time (step 5.1c, decision c). An import preview, revise, apply, a restore or an export takes the
 * single slot; while it is held every other operation is refused as a value (`BUSY`, with what is running) and logged. The slot is
 * mirrored into `AppStatus.operation` (kind, stage, progress). `begin` is synchronous, so two callers can never both get it.
 */
import type { FlowRefusal } from './flow-types';
import type { EventLogWriter, OperationKind, StatusWriter } from './status';

export interface Operation {
  /** The stage name shown in the status (`progress` resets unless given). */
  stage(name: string, progress?: { readonly done: number; readonly total: number | null }): void;
  /** Progress inside the current stage. */
  progress(done: number, total?: number): void;
  end(): void;
}

export interface FlowGate {
  begin(kind: OperationKind, stage: string): Operation | FlowRefusal;
  running(): OperationKind | undefined;
}

export const isRefusal = (value: Operation | FlowRefusal): value is FlowRefusal => 'ok' in value;

export function createFlowGate(status: StatusWriter, log: EventLogWriter): FlowGate {
  let current: { kind: OperationKind; done: boolean } | undefined;
  return {
    running: () => current?.kind,
    begin(kind, firstStage) {
      if (current !== undefined) {
        const message = `another operation is running (${current.kind}); wait for it to finish or cancel it, then try again`;
        log.add({ source: 'app', event: { type: 'flow_busy', message: `${kind} refused: ${message}` } });
        return { ok: false, code: 'BUSY', message, busyWith: current.kind };
      }
      const mine = { kind, done: false };
      current = mine;
      let stage = firstStage;
      const show = (progress: { readonly done: number; readonly total: number | null } | null): void => {
        if (!mine.done) status.update({ operation: { kind, stage, progress } });
      };
      show(null);
      return {
        stage(name, progress) {
          stage = name;
          show(progress ?? null);
        },
        progress: (done, total) => show({ done, total: total ?? null }),
        end() {
          if (mine.done) return;
          mine.done = true;
          if (current === mine) current = undefined;
          status.update({ operation: null });
        },
      };
    },
  };
}
