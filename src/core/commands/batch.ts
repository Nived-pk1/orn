/**
 * Runs a command batch as a chain of Immer productions. Each command is planned against the state left
 * by the previous ones, so "re-point references, then delete" (merge) sees the re-pointed state. The
 * patches are concatenated in order and the inverse patches in reverse order, which makes the whole
 * batch one exact history entry.
 */
import { enablePatches, produceWithPatches, type Patch } from 'immer';
import type { CanonicalState } from '../schema';
import type { CoreIndexes } from '../indexes/contracts';
import { coreIndexEngine } from '../indexes/engine';
import type { CommandError, DomainCommand } from './contracts';
import { applyPlan, planCommand, type PlanView } from './plan';

enablePatches();

export type BatchResult =
  | { readonly ok: true; readonly next: CanonicalState; readonly patches: readonly Patch[]; readonly inversePatches: readonly Patch[] }
  | { readonly ok: false; readonly error: CommandError };

export function runBatch(
  state: CanonicalState,
  indexes: CoreIndexes,
  commands: readonly DomainCommand[],
): BatchResult {
  let working = state;
  // The store's handle describes `state`; once a command changes the state, a fresh one is built on demand.
  let workingIndexes: CoreIndexes | undefined = indexes;
  const forward: Patch[] = [];
  const backward: (readonly Patch[])[] = [];

  for (const command of commands) {
    const current = working;
    const view: PlanView = {
      state: current,
      indexes: () => (workingIndexes ??= coreIndexEngine.build(current)),
    };
    const planned = planCommand(view, command);
    if (!planned.ok) return planned;
    const { plan } = planned;
    if (plan.writes.length === 0 && plan.meta === undefined) continue;
    try {
      const [next, patches, inverse] = produceWithPatches(current, (draft) => {
        applyPlan(draft, plan);
      });
      if (patches.length === 0) continue;
      working = next;
      workingIndexes = undefined;
      forward.push(...patches);
      backward.push(inverse);
    } catch (error) {
      return { ok: false, error: { code: 'INTERNAL', message: `Applying "${command.type}" failed: ${String(error)}` } };
    }
  }
  return { ok: true, next: working, patches: forward, inversePatches: backward.reverse().flat() };
}
