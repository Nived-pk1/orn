/**
 * The family page as ONE list of items (step 5.5b; ADR-037): the header with its partner strip, then each section (an h2) with its
 * groups (an h3) and cards, or a sentence in words when a section is empty. Pure: the study in, items out. The list is virtualised
 * by `VirtualList`, so everything the page shows is an item with a stable key. No chemistry is decided here.
 */
import type { FamilyCard, FamilySectionKind, FamilyStudy } from '@/core/graph';

export type FamilyItem =
  | { readonly kind: 'header'; readonly key: 'header'; readonly study: FamilyStudy }
  | { readonly kind: 'section'; readonly key: string; readonly section: FamilySectionKind; readonly title: string; readonly reactionCount: number; readonly exampleCount: number }
  | { readonly kind: 'empty'; readonly key: string; readonly text: string }
  /** "Only <exam>" (step 8.3b, B2): how many reactions the page leaves out, right after the header. */
  | { readonly kind: 'hidden'; readonly key: 'hidden'; readonly count: number }
  | { readonly kind: 'group'; readonly key: string; readonly section: FamilySectionKind; readonly hubId: string; readonly title: string; readonly count: number; readonly exampleCount: number }
  | { readonly kind: 'card'; readonly key: string; readonly section: FamilySectionKind; readonly hubId: string; readonly card: FamilyCard };

/** " (+ 1 example)" after a count of cards: the examples folded under them (7.3a C3); nothing when there are none. */
export const examplesWords = (n: number): string => (n === 0 ? '' : ` (+ ${n} ${n === 1 ? 'example' : 'examples'})`);

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

/** A family no reaction touches (step 5.5d, item j): what it means and what to do, in words (the page-level empty state). */
export const noReactionsTextOf = (family: string): string =>
  `${family} has no reactions in this dataset: none starts from it and none makes it. A reaction is listed here when its substrate or its product belongs to the family, so import reactions that involve its members, or check that the compounds you expect are members of it`;

/** `hide` (optional): a reaction the page leaves out under "Only <exam>"; its cards go, a group left empty goes, and one `hidden` item counts the reactions. */
export function familyItems(study: FamilyStudy, hide?: (reactionId: FamilyCard['reactionId']) => boolean): FamilyItem[] {
  const items: FamilyItem[] = [{ kind: 'header', key: 'header', study }];
  const hiddenIds = new Set<string>();
  const hidden = (card: FamilyCard): boolean => {
    const gone = hide !== undefined && hide(card.reactionId);
    if (gone) hiddenIds.add(card.reactionId);
    return gone;
  };
  if (study.counts.total === 0) items.push({ kind: 'empty', key: 'empty:family', text: noReactionsTextOf(study.name) });
  for (const section of [study.reactionsOf, study.preparationOf]) {
    items.push({ kind: 'section', key: `section:${section.kind}`, section: section.kind, title: titleOf(section.kind, study.name), reactionCount: section.reactionCount, exampleCount: section.exampleCount });
    if (section.groups.length === 0) {
      items.push({ kind: 'empty', key: `empty:${section.kind}`, text: emptyTextOf(section.kind, study.name) });
      continue;
    }
    let shownGroups = 0;
    for (const group of section.groups) {
      const cards = hide === undefined ? group.cards : group.cards.filter((card) => !hidden(card));
      if (cards.length === 0) continue;
      items.push({ kind: 'group', key: groupKey(section.kind, group.hubId), section: section.kind, hubId: group.hubId, title: groupTitleOf(section.kind, group.name), count: cards.length, exampleCount: group.exampleCount });
      shownGroups += 1;
      for (const card of cards) items.push({ kind: 'card', key: card.key, section: section.kind, hubId: group.hubId, card });
    }
    if (shownGroups === 0) items.push({ kind: 'empty', key: `empty:${section.kind}`, text: emptyTextOf(section.kind, study.name) });
  }
  if (hiddenIds.size > 0) items.splice(1, 0, { kind: 'hidden', key: 'hidden', count: hiddenIds.size });
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
    case 'hidden':
      return 32;
    case 'card':
      return 120 + item.card.groups.reduce((count, group) => count + group.outcomes.length, 0) * 150 + (item.card.elsewhere.length > 0 ? 36 : 0);
  }
}
