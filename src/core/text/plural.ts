/** The ONE counting helper for screens (7.4 A1): "1 reaction", "2 reactions", and the verb that agrees with the count. Pure. */
export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The verb form that agrees with a count: `verbFor(1, 'uses', 'use')` is "uses". */
export const verbFor = (n: number, one: string, many: string): string => (n === 1 ? one : many);
