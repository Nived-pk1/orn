/**
 * The family page as ONE list of items (step 5.5b; ADR-037): the header with its partner strip, then each section (an h2) with its
 * groups (an h3) and cards, or a sentence in words when a section is empty. Pure: the study in, items out. The list is virtualised
 * by `VirtualList`, so everything the page shows is an item with a stable key. No chemistry is decided here.
 */
import type { FamilyCard, FamilySectionKind, FamilyStudy } from '@/core/graph';

export type FamilyItem =
  | { readonly kind: 'header'; readonly key: 'header'; readonly study: FamilyStudy }
  | { readonly kind: 'section'; readonly key: string; readonly section: FamilySectionKind; readonly title: string; readonly reactionCount: number }
  | { readonly kind: 'empty'; readonly key: string; readonly text: string }
  | { readonly kind: 'group'; readonly key: string; readonly section: FamilySectionKind; readonly hubId: string; readonly title: string; readonly count: number }
  | { readonly kind: 'card'; readonly key: string; readonly section: FamilySectionKind; readonly hubId: string; readonly card: FamilyCard };

export const groupKey = (section: FamilySectionKind, hubId: string): string => `group:${section}:${hubId}`;

export function titleOf(section: FamilySectionKind, family: string): string {
  return section === 'reactions_of' ? `Reactions of ${family}` : `Preparation of ${family}`;
}

export function emptyTextOf(section: FamilySectionKind, family: string): string {
  return section === 'reactions_of' ? `No reactions start from ${family} in this dataset` : `No reactions make ${family} in this dataset`;
}

/** "To Aldehydes" (where the reactions of the family go) and "From Alkenes" (what the family is made from). */
export function groupTitleOf(section: FamilySectionKind, partner: string): string {
  return section === 'reactions_of' ? `To ${partner}` : `From ${partner}`;
}

export function familyItems(study: FamilyStudy): FamilyItem[] {
  const items: FamilyItem[] = [{ kind: 'header', key: 'header', study }];
  for (const section of [study.reactionsOf, study.preparationOf]) {
    items.push({ kind: 'section', key: `section:${section.kind}`, section: section.kind, title: titleOf(section.kind, study.name), reactionCount: section.reactionCount });
    if (section.groups.length === 0) {
      items.push({ kind: 'empty', key: `empty:${section.kind}`, text: emptyTextOf(section.kind, study.name) });
      continue;
    }
    for (const group of section.groups) {
      items.push({ kind: 'group', key: groupKey(section.kind, group.hubId), section: section.kind, hubId: group.hubId, title: groupTitleOf(section.kind, group.name), count: group.cards.length });
      for (const card of group.cards) items.push({ kind: 'card', key: card.key, section: section.kind, hubId: group.hubId, card });
    }
  }
  return items;
}

/** The index of the item with this key, or -1. */
export function indexOfKey(items: readonly FamilyItem[], key: string): number {
  return items.findIndex((item) => item.key === key);
}

/** The key of the card of `reactionId` in the group `hubId` of a section (the link between the cards of one reaction). */
export const cardKey = (section: FamilySectionKind, hubId: string, reactionId: string): string => `${section}:${hubId}:${reactionId}`;

/** A guess of an item's height in px before it is measured. */
export function estimateOf(item: FamilyItem): number {
  switch (item.kind) {
    case 'header':
      return 230;
    case 'section':
      return 72;
    case 'group':
      return 48;
    case 'empty':
      return 56;
    case 'card':
      return 120 + item.card.outcomes.length * 150 + (item.card.elsewhere.length > 0 ? 36 : 0);
  }
}
