/**
 * A finding store kept up to date the way the command store does it — `scopeOf` + `validateTouched` +
 * `commitFindings` after each edit — with a check against a fresh `validateAll` (the finding-level analogue
 * of INV-18). Edits are raw Immer recipes, so invalid states (dangling references, cycles) are reachable,
 * which the command store would reject. Used by the field-aware scope tests (ADR-031). Test-only.
 */
import { expect } from 'vitest';
import { coreIndexEngine } from '@/core/indexes/engine';
import type { CoreIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordKind, RecordRef } from '@/core/schema';
import { commitFindings, createFindingStore, validator, type Finding, type FindingStore, type Validator } from '@/core/validation';
import { commit, type Tables } from './state-fixture';

export const canon = (findings: readonly Finding[]): string[] => findings.map((f) => JSON.stringify(f)).sort();

export const everyRecord = (state: CanonicalState): RecordRef[] =>
  (Object.keys(state.records) as RecordKind[]).flatMap((kind) => Object.keys(state.records[kind]).map((id) => ({ kind, id }) as RecordRef));

export interface Edit {
  readonly touched: readonly RecordRef[];
  readonly scope: readonly RecordRef[];
}

export class IncrementalRun {
  state: CanonicalState;
  indexes: CoreIndexes;
  readonly findings: FindingStore = createFindingStore();
  private revision = 1;

  constructor(
    initial: CanonicalState,
    private readonly check: Validator = validator,
  ) {
    this.state = initial;
    this.indexes = coreIndexEngine.build(initial, 0);
    commitFindings(this.findings, everyRecord(initial), this.check.validateAll(initial, this.indexes));
  }

  /** Applies a recipe as one commit and re-validates incrementally; returns what was in scope. */
  apply(recipe: (tables: Tables) => void): Edit {
    const before = this.state;
    const { after, changes } = commit(before, this.revision, recipe);
    this.revision += 1;
    this.indexes = coreIndexEngine.apply(this.indexes, changes, after);
    const touched = [...changes.created, ...changes.updated, ...changes.deleted];
    const scope = this.check.scopeOf(after, this.indexes, touched, before);
    commitFindings(this.findings, scope, this.check.validateTouched(after, this.indexes, touched, before));
    this.state = after;
    return { touched, scope };
  }

  /** The incrementally maintained findings equal a full pass over a freshly built index. */
  expectEqualsFull(label: string): void {
    const fresh = coreIndexEngine.build(this.state, this.indexes.revision);
    expect(canon(this.findings.all()), label).toEqual(canon(this.check.validateAll(this.state, fresh)));
  }
}
