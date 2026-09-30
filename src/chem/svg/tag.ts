/**
 * Reads one start tag for the SVG sanitiser: the name, the attributes (raw, undecoded) and whether it closes itself.
 * A hand-written scanner over the string, linear in the tag's length: quotes are honoured (a `>` inside a quoted value does not
 * end the tag), unquoted values are tolerated, stray characters are skipped, and a tag that never ends is reported as
 * `unterminated` (the caller drops the rest of the input). Pure; never throws.
 */

export interface RawAttribute {
  readonly name: string;
  readonly value: string;
}

export type StartTag =
  | {
      readonly kind: 'start';
      readonly name: string;
      readonly attributes: readonly RawAttribute[];
      /** Attributes beyond the per-tag cap, not read. */
      readonly overflow: number;
      readonly selfClosing: boolean;
      /** Index just after the closing `>`. */
      readonly end: number;
    }
  | { readonly kind: 'unterminated' };

const NAME_CHAR = /[A-Za-z0-9_:.-]/;
const SPACE = /\s/;
const ATTRIBUTE_STOP = /[\s=/>"'<]/;
const UNQUOTED_STOP = /[\s>]/;

/** `from` is the index of the first character of the tag name (just after `<`). */
export function readStartTag(input: string, from: number, maxAttributes: number): StartTag {
  const n = input.length;
  let i = from;
  while (i < n && NAME_CHAR.test(input.charAt(i))) i += 1;
  const name = input.slice(from, i);
  const attributes: RawAttribute[] = [];
  let overflow = 0;

  while (i < n) {
    while (i < n && SPACE.test(input.charAt(i))) i += 1;
    if (i >= n) break;
    const c = input.charAt(i);
    if (c === '>') return { kind: 'start', name, attributes, overflow, selfClosing: false, end: i + 1 };
    if (c === '/') {
      if (input.charAt(i + 1) === '>') return { kind: 'start', name, attributes, overflow, selfClosing: true, end: i + 2 };
      i += 1;
      continue;
    }
    const start = i;
    while (i < n && !ATTRIBUTE_STOP.test(input.charAt(i))) i += 1;
    if (i === start) {
      i += 1; // a stray quote, `=` or `<`
      continue;
    }
    const attributeName = input.slice(start, i);
    while (i < n && SPACE.test(input.charAt(i))) i += 1;
    let value = '';
    if (input.charAt(i) === '=') {
      i += 1;
      while (i < n && SPACE.test(input.charAt(i))) i += 1;
      const quote = input.charAt(i);
      if (quote === '"' || quote === "'") {
        const close = input.indexOf(quote, i + 1);
        if (close === -1) return { kind: 'unterminated' };
        value = input.slice(i + 1, close);
        i = close + 1;
      } else {
        const valueStart = i;
        while (i < n && !UNQUOTED_STOP.test(input.charAt(i))) i += 1;
        value = input.slice(valueStart, i);
      }
    }
    if (attributes.length < maxAttributes) attributes.push({ name: attributeName, value });
    else overflow += 1;
  }
  return { kind: 'unterminated' };
}
