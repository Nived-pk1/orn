/** The words after the headline product of a one-line summary (step 8.4s, S8): "(or C, by conditions)" for outcomes that tie across condition variants. */
export function byConditionsOf(main: string, alternatives: readonly string[]): string {
  const others = [...new Set(alternatives.filter((name) => name !== '' && name !== main))];
  return others.length === 0 ? '' : ` (or ${others.join(', or ')}, by conditions)`;
}
