/**
 * `sameProjection` (step 5.4c, decision Q3): two projections that are equal apart from `revision` and `key`.
 * A hook that rebuilds a projection after a commit keeps the PREVIOUS object when this holds, so everything
 * keyed on object identity (layout request, scene) is not recomputed. Pure and bounded by the size of the
 * two projections; projections are plain JSON-like data, so a structural comparison is exact.
 */
import type { Projection } from './contracts';

function equalValues(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!equalValues(a[i], b[i])) return false;
    return true;
  }
  const left = a as Readonly<Record<string, unknown>>;
  const right = b as Readonly<Record<string, unknown>>;
  // An undefined field equals an absent one; no arrays are built per object (this runs on every rebuild).
  let defined = 0;
  for (const key in left) {
    const value = left[key];
    if (value === undefined) continue;
    defined += 1;
    if (!equalValues(value, right[key])) return false;
  }
  for (const key in right) if (right[key] !== undefined) defined -= 1;
  return defined === 0;
}

export function sameProjection(a: Projection, b: Projection): boolean {
  if (a === b) return true;
  return (
    a.view === b.view &&
    a.nodes.length === b.nodes.length &&
    a.edges.length === b.edges.length &&
    a.bundles.length === b.bundles.length &&
    equalValues(a.truncation, b.truncation) &&
    equalValues(a.unanchoredReactionIds, b.unanchoredReactionIds) &&
    equalValues(a.nodes, b.nodes) &&
    equalValues(a.edges, b.edges) &&
    equalValues(a.bundles, b.bundles)
  );
}
