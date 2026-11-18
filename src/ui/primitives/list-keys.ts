/**
 * The keys of a list (step 8.4g Part B, G5): ONE table that the list's key handler reads and the shortcuts sheet is made from, so the
 * sheet can only say what the list really does.
 */
export type ListAction = 'next' | 'previous' | 'pageDown' | 'pageUp' | 'first' | 'last' | 'enter' | 'open';

export const LIST_KEYS: Readonly<Record<string, ListAction | undefined>> = {
  ArrowDown: 'next',
  ArrowUp: 'previous',
  PageDown: 'pageDown',
  PageUp: 'pageUp',
  Home: 'first',
  End: 'last',
  Enter: 'enter',
  ' ': 'open',
};

export const LIST_KEY_WORDS: Readonly<Record<ListAction, string>> = {
  next: 'Move to the next row',
  previous: 'Move to the previous row',
  pageDown: 'Move a page down',
  pageUp: 'Move a page up',
  first: 'Go to the first row',
  last: 'Go to the last row',
  enter: 'Open the row (or its main action)',
  open: 'Open the row',
};

const SHOWN: Readonly<Record<string, string>> = { ArrowDown: '↓', ArrowUp: '↑', PageDown: 'Page Down', PageUp: 'Page Up', ' ': 'Space' };

/** The list's keys, one line per thing they do. */
export function listShortcuts(): readonly { readonly label: string; readonly keys: readonly string[] }[] {
  return (Object.keys(LIST_KEY_WORDS) as ListAction[]).map((action) => ({
    label: LIST_KEY_WORDS[action],
    keys: Object.entries(LIST_KEYS).filter(([, value]) => value === action).map(([key]) => SHOWN[key] ?? key),
  }));
}
