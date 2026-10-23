/** "1 error", "2 errors" (a count with its noun; `many` for an irregular plural). */
export const pluralWords = (n: number, one: string, many: string = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
