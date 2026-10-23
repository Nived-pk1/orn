/**
 * Phase 6 Definition of Done (docs/IMPLEMENTATION_PLAN.md §3): "no authoring path writes invalid data to the canonical store". For EVERY editor
 * kind, random drafts - a blank draft with fields taken from a demo record, or a demo record opened for editing, then mutated at random
 * (a leaf set to a string, a missing or foreign id, a number or an object; a key deleted; an array element doubled) - are committed the way
 * the editor commits them (`commitDraft`). A refused commit leaves the store exactly as it was; an accepted one leaves a record that a FRESH
 * validation of the final state finds no L1-L3 ERROR in. The last test is the proof that the property can fail: the same run against a store
 * whose gate is broken (it writes whatever it is given) must fail it.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FULL_EDITOR_KINDS } from '@/app/window/editor-entries';
import { commitDraft, editDraft, openSession, type DraftRecipe } from '@/core/editing';
import { coreIndexEngine } from '@/core/indexes';
import type { CanonicalState, RecordKind, RecordRef } from '@/core/schema';
import { validator } from '@/core/validation';
import { demoState } from '@/test-support/app-boot-kit';
import { makeStore } from '@/test-support/command-kit';
import { clockContext } from '@/test-support/editing-kit';
import type { CanonicalStore } from '@/core/commands';

type Bag = Record<string, unknown>;
const STATE: CanonicalState = demoState();
const recordsOf = (kind: string): Bag[] => Object.values((STATE.records as unknown as Record<string, Record<string, Bag>>)[kind] ?? {});
const ALL_IDS: string[] = Object.values(STATE.records as unknown as Record<string, Record<string, Bag>>).flatMap((table) => Object.keys(table));
const POOL = ['', ' ', 'x', 'spc_missing', 'rxn_missing', 'top_missing', '<b>x</b>', 'A'.repeat(400), 'é', '0', 'null', 'unspecified'];
const KINDS = FULL_EDITOR_KINDS as readonly RecordKind[];

const isBag = (value: unknown): value is Bag => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every path to a value inside `value` (depth <= 6), as the keys to walk. */
function pathsOf(value: unknown, at: (string | number)[] = [], out: (string | number)[][] = []): (string | number)[][] {
  if (at.length > 6) return out;
  const children: [string | number, unknown][] = Array.isArray(value) ? value.map((item, index) => [index, item]) : isBag(value) ? Object.entries(value) : [];
  for (const [key, item] of children) {
    out.push([...at, key]);
    pathsOf(item, [...at, key], out);
  }
  return out;
}

/** One deterministic mutation of `draft`, chosen by three integers. */
function mutate(draft: Bag, [a, b, c]: readonly [number, number, number]): void {
  const paths = pathsOf(draft);
  const path = paths[b % Math.max(paths.length, 1)];
  if (path === undefined) return;
  let parent: unknown = draft;
  for (const key of path.slice(0, -1)) parent = (parent as Record<string | number, unknown>)[key];
  const last = path[path.length - 1] as string | number;
  const holder = parent as Record<string | number, unknown>;
  switch (a % 6) {
    case 0:
      holder[last] = POOL[c % POOL.length];
      break;
    case 1:
      holder[last] = ALL_IDS[c % ALL_IDS.length];
      break;
    case 2:
      if (Array.isArray(parent)) parent.splice(Number(last), 1);
      else Reflect.deleteProperty(holder, last);
      break;
    case 3:
      if (Array.isArray(parent)) parent.splice(Number(last), 0, JSON.parse(JSON.stringify(parent[Number(last)] ?? null)));
      else holder[last] = [-1, 0, 1e9, 2.5][c % 4];
      break;
    case 4:
      holder[last] = [null, true, {}, [], 'unknown'][c % 5];
      break;
    default:
      holder[last] = `${ALL_IDS[c % ALL_IDS.length]}`;
  }
}

const mutationArbitrary = fc.array(fc.tuple(fc.nat(1000), fc.nat(1000), fc.nat(1000)), { minLength: 0, maxLength: 3 });
const caseArbitrary = (kind: RecordKind) => fc.record({ blank: fc.boolean(), pick: fc.nat(1000), mutations: mutationArbitrary, kind: fc.constant(kind) });

const tally = { accepted: 0, refused: 0 };

interface Gate {
  readonly store: CanonicalStore;
  /** Puts the store back as it was before the case. */
  readonly restore: () => void;
}

/** Runs one random draft through `commitDraft` and checks the two halves of the property; throws when one fails. */
function check(gate: Gate, input: { blank: boolean; pick: number; mutations: readonly (readonly [number, number, number])[]; kind: RecordKind }): void {
  const { store } = gate;
  const ctx = clockContext();
  const existing = recordsOf(input.kind);
  const model = existing[input.pick % Math.max(existing.length, 1)];
  const opened = input.blank || model === undefined ? openSession(ctx, store.getState(), store.getRevision(), { kind: input.kind, blank: true }) : openSession(ctx, store.getState(), store.getRevision(), { kind: input.kind, id: String(model['id']) } as never);
  if (!opened.ok) return;
  const recipe: DraftRecipe = (draft) => {
    if (input.blank && model !== undefined) for (const [key, value] of Object.entries(structuredClone(model))) if (key !== 'id' && key !== 'kind') draft[key] = value;
    for (const mutation of input.mutations) mutate(draft as Bag, mutation);
  };
  const draft = editDraft(opened.session, recipe, ctx);
  const [before, revision] = [store.getState(), store.getRevision()];
  const outcome = commitDraft(store, draft, ctx);
  tally[outcome.ok ? 'accepted' : 'refused'] += 1;
  if (!outcome.ok) {
    expect(store.getState(), 'a refused commit leaves the state as it was').toBe(before);
    expect(store.getRevision()).toBe(revision);
    return;
  }
  const after = store.getState();
  const written = draft.draft as Bag;
  const ref = { kind: input.kind, id: String(written['id']) } as RecordRef;
  const errors = validator.validateTouched(after, coreIndexEngine.build(after, store.getRevision()), [ref]).filter((finding) => finding.severity === 'error' && finding.level <= 3);
  gate.restore();
  expect(errors.map((finding) => `${finding.ruleId} ${finding.path ?? ''}`), `an accepted ${input.kind} left ERROR findings behind`).toEqual([]);
}

/** The real store, rolled back by Undo after every accepted commit. */
function realGate(): Gate {
  const store = makeStore(STATE);
  return { store, restore: () => void store.undo() };
}

/** A store whose gate is broken: it takes whatever record it is given. The property must fail against it. */
function brokenGate(): Gate {
  let state = STATE;
  let revision = 1;
  const store = {
    getState: () => state,
    getRevision: () => revision,
    dispatch: (envelope: { commands: readonly { type: string; record?: { kind: string; id: string } }[] }) => {
      const records = structuredClone(state.records) as unknown as Record<string, Record<string, unknown>>;
      for (const command of envelope.commands) if (command.record !== undefined) (records[command.record.kind] as Record<string, unknown>)[command.record.id] = command.record;
      state = { ...state, records: records as unknown as CanonicalState['records'] };
      revision += 1;
      return { ok: true, changes: {} };
    },
  } as unknown as CanonicalStore;
  return { store, restore: () => undefined };
}

describe('Phase 6 DoD: no authoring path writes invalid data to the canonical store', () => {
  it('there is an editor for every kind the New menu offers; only the source kind has no demo record to start from (its drafts start blank)', () => {
    expect(KINDS.length).toBeGreaterThanOrEqual(17);
    expect(KINDS.filter((kind) => recordsOf(kind).length === 0)).toEqual(['reference']);
  });

  describe.each(KINDS)('editor kind %s', (kind) => {
    it('random drafts never commit an invalid record (the store gate refuses any L1-L3 ERROR)', () => {
      const gate = realGate();
      fc.assert(fc.property(caseArbitrary(kind), (input) => check(gate, input)), { numRuns: 60, seed: 6009 });
    });
  });

  it('the runs above exercised both outcomes: some drafts were committed and checked, many were refused', () => {
    expect(tally.accepted).toBeGreaterThan(50);
    expect(tally.refused).toBeGreaterThan(50);
  });

  it('seen red: against a store whose gate is broken the same property FAILS', () => {
    const run = (): void => fc.assert(fc.property(fc.constantFrom(...KINDS).chain(caseArbitrary), (input) => check(brokenGate(), input)), { numRuns: 400, seed: 6009 });
    expect(run).toThrow();
  });
});
