/**
 * The bookkeeping of ONE legacy reaction while step 3.11b maps its classification fields: the `CompoundScope` of steps 3.10/3.11a
 * (consume, keep in `provenance.legacy.unmapped`, review reasons) plus an ACCOUNT of every legacy leaf path this step turned into a
 * schema field or kept, so the step can return the paths it did not handle (`deferred`, which must stay empty) instead of trusting
 * that nothing was forgotten.
 */
import { formatPath, leavesOf, type Segment } from './dropped';
import { createScope, type CompoundScope } from './compound-scope';
import type { ReportBuilder } from './report';
import { createTrace } from './trace';

export interface ClassScope extends CompoundScope {
  /** Keeps a dropped leaf of the v4 → v5 port under `unmapped.dropped["<sub>"]`; `legacyPath` is where the leaf is in the input. */
  keepDropped(sub: string, legacyPath: string, value: unknown): void;
  /** Keeps `value` under `path` in `unmapped` although its leaves stand at other legacy paths (a filtered list): `legacyPaths` are the leaves it holds. */
  keepListed(path: readonly string[], value: unknown, legacyPaths: readonly string[]): void;
  /** True when this step consumed the leaf or kept it (`formatPath` spelling). */
  isAccounted(path: string): boolean;
  readonly consumedPaths: ReadonlySet<string>;
}

export function createClassScope(base: readonly Segment[], report: ReportBuilder): ClassScope {
  const trace = createTrace();
  const kept = new Set<string>();
  const inner = createScope(base, trace, report, 'reaction.');
  return {
    reasons: inner.reasons,
    consumedPaths: trace.paths,
    consume: (path, value) => inner.consume(path, value),
    keep(path, value) {
      inner.keep(path, value);
      for (const leaf of leavesOf(value, [...base, ...path])) kept.add(formatPath(leaf.path));
    },
    keepDropped(sub, legacyPath, value) {
      inner.keep(['dropped', sub], value);
      kept.add(legacyPath);
    },
    keepListed(path, value, legacyPaths) {
      inner.keep(path, value);
      for (const legacy of legacyPaths) kept.add(legacy);
    },
    reason: (text) => inner.reason(text),
    unmapped: () => inner.unmapped(),
    isAccounted: (path) => trace.paths.has(path) || kept.has(path),
  };
}
