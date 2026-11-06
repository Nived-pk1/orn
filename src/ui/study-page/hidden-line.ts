/**
 * The words of the quiet line "8 reactions outside JEE Main are hidden · Show them" (step 8.3b, B2; ADR-046). Pure. Nothing hidden, or no exam
 * name: no line.
 */
export interface HiddenLineWords {
  readonly text: string;
  readonly action: string;
}

export function hiddenLineOf(count: number, noun: readonly [string, string], examName: string | undefined): HiddenLineWords | undefined {
  if (count <= 0 || examName === undefined) return undefined;
  const one = count === 1;
  return { text: `${count} ${one ? noun[0] : noun[1]} outside ${examName} ${one ? 'is' : 'are'} hidden`, action: one ? 'Show it' : 'Show them' };
}
