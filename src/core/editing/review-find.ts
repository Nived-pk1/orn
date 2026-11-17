/**
 * "Find by name" on the review queue (step 8.4g, G8): the rows whose record has the text in a name, another name or a formula, case and
 * accents ignored (the way the other lists' find boxes read names). The searchable text of a row is made the first time a text is typed
 * and kept for the rows it was made for, so a keystroke is one `includes` per row. Pure; a record that is gone matches nothing.
 */
import { foldedNamesOf } from '../indexes/names';
import { fold } from '../text/normalizer';
import { recordAt } from '../commands/lookup';
import type { CanonicalState } from '../schema';
import type { QueueRow } from './review-queue';

const MAX_TEXT = 200;

export function createRowFinder(state: CanonicalState, rows: readonly QueueRow[]): (text: string) => readonly QueueRow[] {
  let haystacks: readonly string[] | undefined;
  const build = (): readonly string[] =>
    rows.map((row) => {
      const record = recordAt(state, row.ref) as unknown as Record<string, unknown> | undefined;
      if (record === undefined) return '';
      const formulas = [record['formulaText'], record['formula']].filter((one): one is string => typeof one === 'string').map(fold);
      return [...foldedNamesOf(record), ...formulas].join('\n');
    });
  return (text) => {
    const needle = fold(text.trim().slice(0, MAX_TEXT));
    if (needle === '') return rows;
    haystacks ??= build();
    const found = haystacks;
    return rows.filter((_, index) => (found[index] ?? '').includes(needle));
  };
}
