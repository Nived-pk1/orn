/** "1 error", "2 errors" (a count with its noun; `many` for an irregular plural). */
export const pluralWords = (n: number, one: string, many: string = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const PLURALS: Readonly<Record<string, string>> = { species: 'Compounds', class: 'Classes' };
/** The kind filter's words for a kind ("reaction" -> "Reactions", "species" -> "Compounds"; step 8.4g, G8). */
export const kindPlural = (words: string): string => {
  const known = PLURALS[words];
  if (known !== undefined) return known;
  const title = words.charAt(0).toUpperCase() + words.slice(1);
  return title.endsWith('y') ? `${title.slice(0, -1)}ies` : title.endsWith('s') ? title : `${title}s`;
};
