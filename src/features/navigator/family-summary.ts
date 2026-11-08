/** The family page's one-line summary (step 8.4d, E5): "12 reactions · makes 2 families · made from 3". Zero parts are left out; singulars are used. Pure. */
export interface FamilySummaryCounts {
  readonly reactions: number;
  /** The families this family turns into (its "makes" arrows). */
  readonly makes: number;
  /** The families that make it. */
  readonly madeFrom: number;
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

export function familySummaryOf(counts: FamilySummaryCounts): string {
  return [plural(counts.reactions, 'reaction', 'reactions'), ...(counts.makes === 0 ? [] : [`makes ${plural(counts.makes, 'family', 'families')}`]), ...(counts.madeFrom === 0 ? [] : [`made from ${counts.madeFrom}`])].join(' · ');
}
