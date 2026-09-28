/**
 * A finding store kept up to date the way the command store does it — `validateTouchedByRule` + `commitTouched`
 * after each edit (ADR-032), or with `mode: 'whole'` the older `scopeOf` + `validateTouched` + `commitFindings`
 * (whole subjects only) — with a check against a fresh `validateAll` (the finding-level analogue of INV-18). Edits are raw Immer recipes, so invalid states (dangling references, cycles) are reachable,
 * which the command store would reject. Used by the field-aware scope tests (ADR-031). Test-only.
 */
import { expect } from 'vitest';
import { coreIndexEngine } from '@/core/indexes/engine';
import type { CoreIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordKind, RecordRef } from '@/core/schema';
import { commitFindings, commitTouched, createFindingStore, validator, type Finding, type FindingStore, type Validator } from '@/core/validation';
import { commit, type Tables } from './state-fixture';

export const canon = (findings: readonly Finding[]): string[] => findings.map((f) => JSON.stringify(f)).sort();

export const everyRecord = (state: CanonicalState): RecordRef[] =>
  (Object.keys(state.records) as RecordKind[]).flatMap((kind) => Object.keys(state.records[kind]).map((id) => ({ kind, id }) as RecordRef));

export interface Edit {
  readonly touched: readonly RecordRef[];
  /** Every subject re-validated, whole or per rule. */
  readonly scope: readonly RecordRef[];
  /** The subjects re-validated whole. */
  readonly whole: readonly RecordRef[];
  /** The subjects of which only some rules were re-run, with those rules. */
  readonly byRule: readonly { readonly subject: RecordRef; readonly ruleIds: readonly string[] }[];
}

export class IncrementalRun {
  state: CanonicalState;
  indexes: CoreIndexes;
  readonly findings: FindingStore = createFindingStore();
  private revision = 1;

  constructor(
    initial: CanonicalState,
    private readonly check: Validator = validator,
    private readonly mode: 'by-rule' | 'whole' = 'by-rule',
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
    let edit: Edit;
    if (this.mode === 'by-rule') {
      const result = this.check.validateTouchedByRule(after, this.indexes, touched, before, this.findings);
      commitTouched(this.findings, result);
      const byRule = result.byRule.flatMap((group) => group.subjects.map((subject) => ({ subject, ruleIds: group.ruleIds })));
      edit = { touched, scope: [...result.scope, ...byRule.map((entry) => entry.subject)], whole: result.scope, byRule };
    } else {
      const scope = this.check.scopeOf(after, this.indexes, touched, before);
      commitFindings(this.findings, scope, this.check.validateTouched(after, this.indexes, touched, before));
      edit = { touched, scope, whole: scope, byRule: [] };
    }
    this.state = after;
    return edit;
  }

  /** The incrementally maintained findings equal a full pass over a freshly built index. */
  expectEqualsFull(label: string): void {
    const fresh = coreIndexEngine.build(this.state, this.indexes.revision);
    expect(canon(this.findings.all()), label).toEqual(canon(this.check.validateAll(this.state, fresh)));
  }
}
