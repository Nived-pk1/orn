/** Matching for "Find a family" (step 8.2b, E): names that start with the text first, then names that contain it; case and accent insensitive. Pure. */

export interface NamedFamily {
  readonly id: string;
  readonly name: string;
}

const fold = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function matchFamilies<T extends NamedFamily>(families: readonly T[], query: string): T[] {
  const wanted = fold(query);
  if (wanted === '') return [];
  const byName = (a: T, b: T): number => (fold(a.name) < fold(b.name) ? -1 : fold(a.name) > fold(b.name) ? 1 : a.id < b.id ? -1 : 1);
  const starts = families.filter((f) => fold(f.name).startsWith(wanted)).sort(byName);
  const contains = families.filter((f) => !fold(f.name).startsWith(wanted) && fold(f.name).includes(wanted)).sort(byName);
  return [...starts, ...contains];
}
