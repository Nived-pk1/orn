/**
 * L3 rules for the curated arrangement of the navigator overview (PRS-004, PRS-005; schema version 2, step 5.5c). Presentation only,
 * so a WARNING at most, never an ERROR: two hubs on one grid cell, and one family group drawn in two different tones. As the other
 * duplicate rules, the lowest ID wins and the others are flagged, so a set of clashes always leaves one clean anchor.
 * The anchors are grouped once per state (a memo keyed by the state object, which commits replace), so a full run is linear.
 */
import type { CanonicalState, NavigatorAnchor, RecordRef } from '../../schema';
import type { RuleContext, ValidationRule } from '../contracts';
import { MAX_RELATED, NO_REFERENCED_READS, rule } from './helpers';

interface Groups {
  /** Anchors with a cell, by "column,row", each list in ID order. */
  readonly byCell: ReadonlyMap<string, readonly NavigatorAnchor[]>;
  /** Anchors with a group, by the group text, each list in ID order. */
  readonly byGroup: ReadonlyMap<string, readonly NavigatorAnchor[]>;
}

const memo = new WeakMap<CanonicalState, Groups>();

function groupsOf(state: CanonicalState): Groups {
  const known = memo.get(state);
  if (known !== undefined) return known;
  const byCell = new Map<string, NavigatorAnchor[]>();
  const byGroup = new Map<string, NavigatorAnchor[]>();
  const push = (map: Map<string, NavigatorAnchor[]>, key: string, anchor: NavigatorAnchor): void => {
    const list = map.get(key);
    if (list === undefined) map.set(key, [anchor]);
    else list.push(anchor);
  };
  for (const id of Object.keys(state.records.navigator_anchor).sort()) {
    const anchor = state.records.navigator_anchor[id] as NavigatorAnchor;
    if (anchor.cell !== undefined) push(byCell, `${anchor.cell.column},${anchor.cell.row}`, anchor);
    if (anchor.group !== undefined) push(byGroup, anchor.group, anchor);
  }
  const groups: Groups = { byCell, byGroup };
  memo.set(state, groups);
  return groups;
}

const refOf = (anchor: NavigatorAnchor): RecordRef => ({ kind: 'navigator_anchor', id: anchor.id }) as RecordRef;

/** The other anchors that share this anchor's cell, or its group (the peers of both rules). */
function peersOf(anchor: NavigatorAnchor, ctx: RuleContext): RecordRef[] {
  const { byCell, byGroup } = groupsOf(ctx.state);
  const same = [
    ...(anchor.cell === undefined ? [] : (byCell.get(`${anchor.cell.column},${anchor.cell.row}`) ?? [])),
    ...(anchor.group === undefined ? [] : (byGroup.get(anchor.group) ?? [])),
  ];
  return [...new Map(same.filter((other) => other.id !== anchor.id).map((other) => [other.id, refOf(other)])).values()];
}

export const ARRANGEMENT_RULES: readonly ValidationRule[] = [
  rule({
    id: 'PRS-004',
    level: 3,
    kinds: ['navigator_anchor'],
    defaultSeverity: 'warning',
    scope: 'global',
    // compares with the anchors on the same cell: `peers`
    referencedReads: NO_REFERENCED_READS,
    description: 'Two navigator anchors on the same grid cell (lowest ID wins)',
    peers: (record, ctx) => (record.kind === 'navigator_anchor' ? peersOf(record, ctx) : []),
    *check(anchor, ctx) {
      if (anchor.cell === undefined) return;
      const winners = (groupsOf(ctx.state).byCell.get(`${anchor.cell.column},${anchor.cell.row}`) ?? []).filter((other) => other.id < anchor.id);
      if (winners.length === 0) return;
      yield { path: 'cell', message: `Cell (${anchor.cell.column}, ${anchor.cell.row}) already holds another hub; the boxes are stacked in it.`, related: winners.slice(0, MAX_RELATED).map(refOf) };
    },
  }),

  rule({
    id: 'PRS-005',
    level: 3,
    kinds: ['navigator_anchor'],
    defaultSeverity: 'warning',
    scope: 'global',
    // compares with the anchors of the same group: `peers`
    referencedReads: NO_REFERENCED_READS,
    description: 'One family group drawn in two different tones (the tone of the lowest ID wins)',
    peers: (record, ctx) => (record.kind === 'navigator_anchor' ? peersOf(record, ctx) : []),
    *check(anchor, ctx) {
      if (anchor.group === undefined || anchor.tone === undefined) return;
      const first = (groupsOf(ctx.state).byGroup.get(anchor.group) ?? []).find((other) => other.tone !== undefined);
      if (first === undefined || first.id >= anchor.id || first.tone === anchor.tone) return;
      yield { path: 'tone', message: `The group "${anchor.group}" is already drawn in ${String(first.tone)}; this hub says ${anchor.tone}.`, related: [refOf(first)] };
    },
  }),
];
