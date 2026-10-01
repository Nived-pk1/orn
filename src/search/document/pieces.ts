/**
 * Small helpers the per-kind builders share (step 4.5): plain text out of mini-markup, and a collector for the `text` field that
 * applies the 4,000 character cap once, at the end, and says when it cut.
 */
import { parseRichText, type RichNode } from '@/core/text';
import { SEARCH_TEXT_CAP } from '../contracts';

/** The words of mini-markup without its markers: link labels instead of ids, paragraphs and bullets on lines of their own. */
export function plainText(source: string | undefined): string {
  if (source === undefined || source === '') return '';
  const out: string[] = [];
  // iterative on purpose: the parser bounds nesting, but a search builder must not depend on it
  const stack: RichNode[] = [...parseRichText(source)].reverse();
  while (stack.length > 0) {
    const node = stack.pop() as RichNode;
    switch (node.type) {
      case 'text':
      case 'sub':
      case 'sup':
        out.push(node.text);
        break;
      case 'link':
        out.push(node.label);
        break;
      case 'strong':
      case 'em':
        for (let i = node.children.length - 1; i >= 0; i -= 1) stack.push(node.children[i] as RichNode);
        break;
      case 'paragraph':
        out.push('\n');
        for (let i = node.children.length - 1; i >= 0; i -= 1) stack.push(node.children[i] as RichNode);
        break;
      case 'bullets':
        for (let i = node.items.length - 1; i >= 0; i -= 1) {
          const item = node.items[i] as readonly RichNode[];
          for (let j = item.length - 1; j >= 0; j -= 1) stack.push(item[j] as RichNode);
          stack.push({ type: 'text', text: '\n' });
        }
        break;
    }
  }
  return out.join('').replace(/[ \t]*\n[ \t\n]*/g, '\n').trim();
}

/** Collects the pieces of a document's `text` in a fixed order. */
export class TextPieces {
  private readonly pieces: string[] = [];

  /** Plain strings (labels, values, equation text). Blank ones are skipped. */
  add(...values: readonly (string | undefined)[]): this {
    for (const value of values) if (value !== undefined && value.trim() !== '') this.pieces.push(value.trim());
    return this;
  }

  /** Rich text, as plain text. */
  rich(...values: readonly (string | undefined)[]): this {
    for (const value of values) {
      const text = plainText(value);
      if (text !== '') this.pieces.push(text);
    }
    return this;
  }

  /** The joined text, cut at the cap (never in the middle of a surrogate pair). */
  finish(): { readonly text: string; readonly textTruncated: boolean } {
    const joined = this.pieces.join('\n');
    if (joined.length <= SEARCH_TEXT_CAP) return { text: joined, textTruncated: false };
    let end = SEARCH_TEXT_CAP;
    const last = joined.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end -= 1;
    return { text: joined.slice(0, end), textTruncated: true };
  }
}

/** Distinct non-blank strings in first-seen order. */
export function distinct(values: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (value === undefined) continue;
    const trimmed = value.trim();
    if (trimmed !== '' && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}
