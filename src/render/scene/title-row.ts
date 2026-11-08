/**
 * The title row of a box (step 8.4c, A3): the room at its right end for "↻ n" (reactions that start and end in the family) and the badges (R, M, ...).
 * The box width is computed to include it, so neither lies over the title or the formula. Pure; the measurer is injected like everywhere in sizing.
 */
import type { GraphNode } from '@/core/graph/contracts';
import { badgesOf } from './badges';
import type { SceneBadge, TextMeasurer } from './contracts';
import { plainRuns } from './formatted-text';
import { glyphOf } from './node-content';

/** The size of a badge (px, map units). */
export const BADGE_SIZE = 14;
/** The width of a count badge / pill for `count`. */
export const countWidth = (count: number): number => BADGE_SIZE + Math.max(0, String(count).length - 1) * 6;

/** The gap between the title and what follows it in the row, and between neighbours in the row. */
export const TITLE_ROW_GAP = 8;
/** The gap between two badges (px, map units). */
export const BADGE_GAP = 3;
/** The size of the "↻ n" caption (px, map units, before the box scale). */
export const CAPTION_SIZE = 11;

export const loopsCaption = (loops: number): string => `↻ ${loops}`;

/** The width of one badge: a count pill for hidden neighbours, a square mark otherwise. */
export const badgeWidth = (badge: SceneBadge): number => (badge.kind === 'hidden_neighbours' && badge.count !== undefined ? countWidth(badge.count) : BADGE_SIZE);

/** The width of the badge run at the right end of the title row, gaps included; 0 when there is none. */
export const badgeRunWidth = (badges: readonly SceneBadge[]): number => badges.reduce((sum, badge) => sum + badgeWidth(badge) + BADGE_GAP, 0);

/** The loop count a box shows, or 0 (the Unclassified bucket shows none). */
export const loopsOf = (node: GraphNode): number => (glyphOf(node) === 'unclassified' ? 0 : Math.max(0, node.reactionCounts?.loops ?? 0));

/** What the title row must hold besides the title: the gap, the caption and the badges. */
export function titleRowExtra(node: GraphNode, measure: TextMeasurer): number {
  const loops = loopsOf(node);
  const caption = loops > 0 ? measure(plainRuns(loopsCaption(loops)), { size: CAPTION_SIZE, weight: 'regular', mono: false }).width : 0;
  const finite = Number.isFinite(caption) && caption > 0 ? caption : 0;
  const run = badgeRunWidth(badgesOf(node));
  return (finite > 0 ? TITLE_ROW_GAP + finite : 0) + (run > 0 ? TITLE_ROW_GAP + run - BADGE_GAP : 0);
}
