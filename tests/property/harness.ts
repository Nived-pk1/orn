/** Shared pieces of the property tests (docs/TEST_STRATEGY.md §4). */
import type fc from 'fast-check';
import { coreIndexEngine } from '@/core/indexes/engine';
import { referenceEngine } from '@/core/references';
import { serializeDocument, stateToDocument } from '@/core/dataset';
import type { CommandContext, CommitResult } from '@/core/commands';
import type { StoreHandle } from '@/core/commands';
import type { AnyRecord, CanonicalState, RecordKind } from '@/core/schema';
import { validator } from '@/core/validation';
import { resolveIntent, type Intent } from '@/test-support/arbitraries';
import { makeStore, testContext } from '@/test-support/command-kit';

/** Enough runs to explore, few enough for `npm run check`; override with ORN_PROPERTY_RUNS. */
export const RUNS = Number(process.env['ORN_PROPERTY_RUNS'] ?? 25);
/** Per-test timeout that grows with the run count (vi.setConfig in each property file). */
export const TIMEOUT_MS = Math.max(30_000, RUNS * 1_000);
export const PARAMS = { numRuns: RUNS } satisfies fc.Parameters<unknown>;

export function bytesOf(state: CanonicalState): string {
  const out = serializeDocument(
    stateToDocument(state, { exportedAt: '2026-09-21T00:00:00.000Z', exportScope: 'full', generator: { app: 'property', version: '0' } }),
  );
  if (!out.ok) throw new Error(`state does not serialise: ${JSON.stringify(out.issues.slice(0, 3))}`);
  return out.text;
}

export interface Step {
  readonly intent: Intent;
  readonly result: CommitResult | undefined;
  readonly before: CanonicalState;
  readonly after: CanonicalState;
}

/** Applies the intents in order against the live state; skips intents with no target. */
export function runIntents(store: StoreHandle, intents: readonly Intent[], ctx: CommandContext): Step[] {
  const steps: Step[] = [];
  for (const intent of intents) {
    const before = store.getState();
    const envelope = resolveIntent(before, intent, ctx);
    const result = envelope === undefined ? undefined : store.dispatch(envelope);
    steps.push({ intent, result, before, after: store.getState() });
  }
  return steps;
}

export function freshStore(state: CanonicalState): { store: StoreHandle; ctx: CommandContext } {
  return { store: makeStore(state), ctx: testContext(11) };
}

export const allRecords = (state: CanonicalState): AnyRecord[] =>
  Object.values(state.records).flatMap((table) => Object.values(table as Readonly<Record<string, AnyRecord>>));

export const kindsOf = (state: CanonicalState): RecordKind[] => Object.keys(state.records) as RecordKind[];

/** Reference targets (by record kind and ID) that do not exist in the state. Independent of the validator. */
export function danglingReferences(state: CanonicalState): string[] {
  const out: string[] = [];
  for (const record of allRecords(state)) {
    for (const ref of referenceEngine.extract(record)) {
      if (ref.targetKind === undefined) continue;
      if (!Object.hasOwn(state.records[ref.targetKind], ref.targetId)) out.push(`${record.id}.${ref.path} → ${ref.targetId}`);
    }
  }
  return out;
}

export const errorFindings = (state: CanonicalState): string[] =>
  validator
    .validateAll(state, coreIndexEngine.build(state, 0))
    .filter((f) => f.severity === 'error')
    .map((f) => `${f.ruleId} ${f.subject.id}`);
