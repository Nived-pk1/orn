/**
 * The reaction (CHEM-005) and mechanism (CHEM-008) checks: the same shape twice. A record is planned into requests (pure, from
 * `src/chem/checks`), the requests whose content is remembered as not checkable are not sent, the rest go to the worker in
 * batches, and the results are applied only if the record still plans to the SAME requests (a record edited while the worker was
 * busy is dropped, never applied stale). Findings are merged by rule; the status says what was not compared, out loud.
 */
import { MAX_CHECK_BATCH } from '@/chem/checks/contracts';
import type { BalanceRequest, BalanceResult, CheckDraft, NotCompared, StepCheckRequest, StepCheckResult } from '@/chem/checks/contracts';
import { balancePlan } from '@/chem/checks/plan-reaction';
import { mechanismPlan } from '@/chem/checks/plan-mechanism';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { CheckCall } from '../client';
import { runBatches } from './batches';
import type { Entry, L4Context, Method } from './context';
import { refKey } from './context';
import { L4_BATCH_SIZE } from './contracts';

interface Plan<Q> {
  readonly requests: readonly Q[];
  readonly notCompared: readonly NotCompared[];
}

interface Kind<Q, R extends { readonly status: BalanceResult['status']; readonly drafts: readonly CheckDraft[] }> {
  readonly kind: 'reaction' | 'mechanism';
  readonly ruleIds: readonly string[];
  readonly method: Method;
  readonly plan: (state: CanonicalState, id: string) => Plan<Q> | undefined;
  readonly send: (ctx: L4Context, requests: readonly Q[]) => Promise<CheckCall<{ readonly toolkit: { readonly name: string; readonly version: string }; readonly results: readonly R[] }>>;
}

export const REACTION_RULES: readonly string[] = ['CHEM-005'];
export const MECHANISM_RULES: readonly string[] = ['CHEM-008'];

const reactionKind: Kind<BalanceRequest, BalanceResult> = {
  kind: 'reaction',
  ruleIds: REACTION_RULES,
  method: 'checkReaction',
  plan(state, id) {
    const reaction = Object.hasOwn(state.records.reaction, id) ? state.records.reaction[id] : undefined;
    return reaction === undefined ? undefined : balancePlan(state, reaction);
  },
  send: (ctx, requests) => ctx.call('checkReaction', requests.length, () => ctx.ports.chem.checkReaction(requests)),
};

const mechanismKind: Kind<StepCheckRequest, StepCheckResult> = {
  kind: 'mechanism',
  ruleIds: MECHANISM_RULES,
  method: 'checkMechanism',
  plan(state, id) {
    const mechanism = Object.hasOwn(state.records.mechanism, id) ? state.records.mechanism[id] : undefined;
    return mechanism === undefined ? undefined : mechanismPlan(mechanism);
  },
  send: (ctx, requests) => ctx.call('checkMechanism', requests.length, () => ctx.ports.chem.checkMechanism(requests)),
};

const sigOf = (plan: Plan<unknown>): string => JSON.stringify(plan.requests);

async function runKind<Q extends { readonly path: string }, R extends { readonly status: BalanceResult['status']; readonly drafts: readonly CheckDraft[] }>(
  ctx: L4Context,
  config: Kind<Q, R>,
  ids: readonly string[],
): Promise<void> {
  const state = ctx.ports.state();
  interface Due {
    readonly id: string;
    readonly ref: RecordRef;
    readonly sig: string;
    readonly plan: Plan<Q>;
    readonly held: NotCompared[];
  }
  const due: Due[] = [];
  const items: { readonly due: Due; readonly request: Q }[] = [];
  const empty: RecordRef[] = [];
  for (const id of ids) {
    const ref: RecordRef = { kind: config.kind, id };
    const plan = config.plan(state, id);
    if (plan === undefined) {
      ctx.forget(ref);
      continue;
    }
    const sig = sigOf(plan);
    ctx.sent.set(refKey(ref), sig);
    const entry: Due = { id, ref, sig, plan, held: [] };
    ctx.setStatus(ref, { state: 'pending' });
    due.push(entry);
    for (const request of plan.requests) {
      const known = ctx.memory.get(JSON.stringify(request), ctx.version());
      if (known === undefined) items.push({ due: entry, request });
      else {
        ctx.countRemembered();
        entry.held.push({ ruleId: config.ruleIds[0] ?? '', reason: `${request.path} was not sent again: the toolkit did not answer for it before (${known.reason})` });
      }
    }
    if (plan.requests.length === 0) empty.push(ref);
  }
  ctx.merge(empty, config.ruleIds, []);

  const settled = await runBatches(
    items,
    Math.min(L4_BATCH_SIZE, MAX_CHECK_BATCH),
    (chunk) => config.send(ctx, chunk.map((item) => item.request)),
    (answer) => answer.results,
    ctx.noteToolkit,
  );
  if (ctx.disposed()) return;

  const subjects: RecordRef[] = [];
  const entries: Entry[] = [];
  for (const entry of due) {
    const now = config.plan(ctx.ports.state(), entry.id);
    if (now === undefined || sigOf(now) !== entry.sig) {
      ctx.countStale();
      continue;
    }
    const notCompared: NotCompared[] = [...entry.plan.notCompared, ...entry.held];
    let unanswered: { reason: 'timeout' | 'unavailable'; message: string } | undefined = undefined;
    let remembered = false;
    for (const answer of settled.filter((s) => s.item.due === entry)) {
      const outcome = answer.ok ? (answer.result.status.state === 'not_checked' ? answer.result.status : undefined) : { reason: answer.reason, message: answer.error };
      if (outcome !== undefined) {
        unanswered ??= { reason: outcome.reason, message: outcome.message };
        // A worker that did not answer at all (down, crashed twice) says nothing about the request: not remembered.
        if (!(answer.ok === false && answer.reason === 'unavailable') && ctx.canRemember()) {
          ctx.memory.add(JSON.stringify(answer.item.request), ctx.version(), { reason: outcome.reason, message: outcome.message });
          remembered = true;
        }
      } else if (answer.ok) {
        if (answer.result.status.state === 'checked') notCompared.push(...answer.result.status.notCompared);
        for (const draft of answer.result.drafts) entries.push({ subject: entry.ref, draft });
      }
    }
    ctx.setStatus(entry.ref, unanswered === undefined ? { state: 'checked', notCompared } : { state: 'not_checked', ...unanswered, remembered });
    subjects.push(entry.ref);
  }
  ctx.merge(subjects, config.ruleIds, entries);
}

export const runReactionJob = (ctx: L4Context, ids: readonly string[]): Promise<void> => runKind(ctx, reactionKind, ids);
export const runMechanismJob = (ctx: L4Context, ids: readonly string[]): Promise<void> => runKind(ctx, mechanismKind, ids);
