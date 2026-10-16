/**
 * The phone's Families tab (ADR-039): the SAME family rows as the List view (`listRowsOf`: same families, same order), shown as cards
 * grouped by colour group. No new query and no chemistry: the group order is the map's own (`legendOf`, built from the Scene), the
 * formula is the hub's own sub-label, and the count is the reactions on the arrows that leave or enter it (a loop once). Families with
 * no group follow the groups, then Unclassified.
 */
import type { AnchorTone } from '@/core/schema';
import type { FormattedText, Scene } from '@/render/scene';
import { bundleOf } from './canvas-menu';
import { legendOf } from './legend';
import { listRowsOf } from './list-rows';

export interface FamilyCard {
  readonly id: string;
  readonly name: string;
  /** The general formula as the map shows it (sub and superscript runs), when the hub has one. */
  readonly formula: FormattedText | undefined;
  /** Reactions on the arrows that leave or enter the family (a reaction inside the family counts once). */
  readonly reactions: number;
  readonly tone: AnchorTone | undefined;
}

export interface FamilyCardGroup {
  readonly title: string;
  readonly cards: readonly FamilyCard[];
}

export const NO_GROUP_TITLE = 'No group';
export const UNCLASSIFIED_TITLE = 'Unclassified';

export function familyCardsOf(scene: Scene | null): readonly FamilyCardGroup[] {
  if (scene === null) return [];
  const rows = listRowsOf(scene).families;
  const nodes = new Map(scene.nodes.map((node) => [node.id, node] as const));
  const loops = new Map<string, number>();
  for (const edge of scene.edges) if (edge.from === edge.to) loops.set(edge.from, (loops.get(edge.from) ?? 0) + bundleOf(edge));
  const cardOf = (id: string): FamilyCard | undefined => {
    const row = rows.find((candidate) => candidate.id === id);
    const node = nodes.get(id);
    if (row === undefined || node === undefined) return undefined;
    return { id, name: row.name, formula: node.sublabel, reactions: row.out + row.in - (loops.get(id) ?? 0), tone: node.tone };
  };
  const groups: FamilyCardGroup[] = [];
  const placed = new Set<string>();
  const push = (title: string, ids: readonly string[]): void => {
    const cards = ids.map(cardOf).filter((card): card is FamilyCard => card !== undefined);
    for (const card of cards) placed.add(card.id);
    if (cards.length > 0) groups.push({ title, cards });
  };
  for (const item of legendOf(scene)) push(item.group, rows.filter((row) => row.group === item.group).map((row) => row.id));
  push(NO_GROUP_TITLE, rows.filter((row) => !placed.has(row.id) && nodes.get(row.id)?.box === 'hub').map((row) => row.id));
  push(UNCLASSIFIED_TITLE, rows.filter((row) => !placed.has(row.id)).map((row) => row.id));
  return groups;
}
