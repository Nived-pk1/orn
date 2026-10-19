/**
 * Editor session operations (ADR-040): open, edit, local undo and redo. A session is a value; every operation returns a new one.
 * The draft changes through Immer `produceWithPatches`: the INVERSE patches go on `past`, undo moves the step to `future` as the patches
 * that redo it, so undo then redo (and the reverse) return the same draft. What coalescing needs (the field path and time of the latest
 * edit) lives in a WeakMap keyed by the session value: it is memory only, never stored, so after a reload the next edit starts a new step.
 */
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';
import { RECORD_ID_PREFIX, type RecordRef } from '../schema';
import type { CommandContext, EditorSession } from '../commands/contracts';
import { recordAt } from '../commands/lookup';
import type { CanonicalState } from '../schema';
import { blankDraft } from './blank';
import { COALESCE_WINDOW_MS, MAX_DRAFT_STEPS, type EditMeta, type OpenSessionResult, type OpenTarget } from './contracts';

enablePatches();

export type DraftValue = Record<string, unknown>;
export type DraftRecipe = (draft: Draft<DraftValue>) => void;

interface Memory {
  readonly path: string;
  readonly atMs: number;
}
const memory = new WeakMap<EditorSession, Memory>();

const clone = <T>(value: T): T => structuredClone(value);
const isTarget = (target: OpenTarget): target is RecordRef => 'id' in target;

export function openSession(ctx: CommandContext, state: CanonicalState, revision: number, target: OpenTarget): OpenSessionResult {
  if (isTarget(target)) {
    const record = recordAt(state, target);
    if (record === undefined) return { ok: false, reason: 'not_found' };
    return {
      ok: true,
      session: {
        id: ctx.newId('eds'),
        kind: target.kind,
        target: { kind: target.kind, id: target.id } as EditorSession['target'],
        baseRevision: revision,
        baseRecord: clone(record),
        draft: clone(record),
        past: [],
        future: [],
        updatedAt: ctx.now(),
      },
    };
  }
  return {
    ok: true,
    session: {
      id: ctx.newId('eds'),
      kind: target.kind,
      target: null,
      baseRevision: revision,
      baseRecord: null,
      // a blank draft (decision D3) or the smallest one that names itself: its kind and a fresh ID (the schema still decides whether it is a record)
      draft: (target.blank === true ? blankDraft(target.kind, ctx) : undefined) ?? { kind: target.kind, id: ctx.newId(RECORD_ID_PREFIX[target.kind]) },
      past: [],
      future: [],
      updatedAt: ctx.now(),
    },
  };
}

const bounded = (steps: readonly (readonly Patch[])[]): readonly (readonly Patch[])[] =>
  steps.length > MAX_DRAFT_STEPS ? steps.slice(steps.length - MAX_DRAFT_STEPS) : steps;

/** Applies `patches` to `draft` and returns the new draft with the patches that undo the application. */
function applyWithInverse(draft: unknown, patches: readonly Patch[]): { readonly next: unknown; readonly inverse: Patch[] } {
  const [next, , inverse] = produceWithPatches(draft as DraftValue, (d) => applyPatches(d, patches as Patch[]) as Draft<DraftValue>);
  return { next, inverse };
}

export function editDraft(session: EditorSession, recipe: DraftRecipe, ctx: CommandContext, meta: EditMeta = {}): EditorSession {
  const [next, , inverse] = produceWithPatches(session.draft as DraftValue, recipe);
  if (inverse.length === 0) return session; // nothing changed: no step, no new time
  const now = ctx.now();
  const nowMs = Date.parse(now);
  const before = memory.get(session);
  const joins =
    meta.path !== undefined && before !== undefined && before.path === meta.path && Number.isFinite(nowMs) && nowMs - before.atMs >= 0 && nowMs - before.atMs <= COALESCE_WINDOW_MS && session.past.length > 0 && session.future.length === 0;
  const past = joins
    ? [...session.past.slice(0, -1), [...inverse, ...(session.past[session.past.length - 1] as readonly Patch[])]]
    : bounded([...session.past, inverse]);
  const result: EditorSession = { ...session, draft: next, past, future: [], updatedAt: now };
  if (meta.path !== undefined && Number.isFinite(nowMs)) memory.set(result, { path: meta.path, atMs: nowMs });
  return result;
}

export const canUndoDraft = (session: EditorSession): boolean => session.past.length > 0;
export const canRedoDraft = (session: EditorSession): boolean => session.future.length > 0;

export function undoDraft(session: EditorSession, ctx: CommandContext): EditorSession {
  const step = session.past[session.past.length - 1];
  if (step === undefined) return session;
  const { next, inverse } = applyWithInverse(session.draft, step);
  return { ...session, draft: next, past: session.past.slice(0, -1), future: bounded([...session.future, inverse]), updatedAt: ctx.now() };
}

export function redoDraft(session: EditorSession, ctx: CommandContext): EditorSession {
  const step = session.future[session.future.length - 1];
  if (step === undefined) return session;
  const { next, inverse } = applyWithInverse(session.draft, step);
  return { ...session, draft: next, past: bounded([...session.past, inverse]), future: session.future.slice(0, -1), updatedAt: ctx.now() };
}
