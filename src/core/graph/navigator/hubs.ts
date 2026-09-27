/**
 * Hub resolution (docs/GRAPH_SEMANTICS.md §3) now lives in `src/core/indexes/navigator-rollup.ts` (step
 * 2.9): building the navigator's precomputed roll-up index needs it, and `core/indexes` cannot import
 * `core/graph` (that would be a cycle — `core/graph` already imports `core/indexes`). Re-exported here so
 * `UNCLASSIFIED_HUB_ID` keeps one public home for graph-layer and feature code.
 */
export { UNCLASSIFIED_HUB_ID } from '../../indexes/navigator-rollup';
export type { HubResolution } from '../../indexes/navigator-rollup';
