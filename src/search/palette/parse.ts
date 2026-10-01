/**
 * The command palette grammar (step 4.5, SEARCH §4). Pure, total and linear: it never throws and looks at no more than
 * `PALETTE_INPUT_CAP` characters, whatever it is given.
 *
 *   plain text        searches everything
 *   r: s: c: g: n: m: t:   narrow to reactions, species, classes, reagents, named reactions, mechanisms, topics
 *   > text            a command ("> export", "> new reaction", "> toggle exam scope")
 * Case and whitespace tolerant: " R :ethanol", "s:   Br2", ">   Toggle   Exam Scope" all parse; a full-width colon (typed with an
 * IME) counts as a colon. Only the FIRST prefix is read; anything after it is the text. A letter and colon that is not a prefix
 * (`x:`) stays in the text. What is cut to stay within the engine's limits (`MAX_QUERY_CHARS`, `MAX_QUERY_WORDS`) is reported
 * in `truncated`, never dropped silently.
 */
import type { RecordKind } from '@/core/schema';
import { MAX_QUERY_CHARS, MAX_QUERY_WORDS } from '../contracts';

/** Characters read at all: the longest text plus room for a prefix and the whitespace around it. */
export const PALETTE_INPUT_CAP = MAX_QUERY_CHARS + 64;

export const PALETTE_PREFIXES: Readonly<Record<string, RecordKind>> = {
  r: 'reaction',
  s: 'species',
  c: 'class',
  g: 'reagent',
  n: 'named_reaction',
  m: 'mechanism',
  t: 'topic',
};

export type PaletteQuery =
  | { readonly mode: 'search'; readonly text: string; readonly kinds?: readonly RecordKind[]; readonly truncated: boolean }
  | { readonly mode: 'command'; readonly text: string; readonly truncated: boolean };

const PREFIX = /^\s*([a-zA-Z])\s*[:：]\s*/;
const COMMAND = /^\s*>\s*/;

/** Whitespace runs to one space, trimmed, at most `MAX_QUERY_WORDS` words and `MAX_QUERY_CHARS` characters. */
function bounded(text: string, alreadyCut: boolean): { readonly text: string; readonly truncated: boolean } {
  const words = text.split(/\s+/).filter((word) => word !== '');
  let truncated = alreadyCut || words.length > MAX_QUERY_WORDS;
  let joined = words.slice(0, MAX_QUERY_WORDS).join(' ');
  if (joined.length > MAX_QUERY_CHARS) {
    joined = joined.slice(0, MAX_QUERY_CHARS);
    const last = joined.charCodeAt(joined.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) joined = joined.slice(0, -1);
    truncated = true;
  }
  return { text: joined.trim(), truncated };
}

export function parsePalette(input: string): PaletteQuery {
  const cut = typeof input === 'string' && input.length > PALETTE_INPUT_CAP;
  const head = typeof input === 'string' ? (cut ? input.slice(0, PALETTE_INPUT_CAP) : input) : '';
  const command = COMMAND.exec(head);
  if (command !== null) {
    const { text, truncated } = bounded(head.slice(command[0].length), cut);
    return { mode: 'command', text: text.toLowerCase(), truncated };
  }
  const prefix = PREFIX.exec(head);
  const kind = prefix === null ? undefined : PALETTE_PREFIXES[(prefix[1] as string).toLowerCase()];
  const { text, truncated } = bounded(kind === undefined ? head : head.slice((prefix as RegExpExecArray)[0].length), cut);
  return kind === undefined ? { mode: 'search', text, truncated } : { mode: 'search', text, kinds: [kind], truncated };
}
