/**
 * Chemistry-aware text utilities (pure) — docs/SEARCH.md §2 and docs/DOMAIN_MODEL.md §3.4.
 */
import type { RecordRef } from '../schema';

export interface TextNormalizer {
  /**
   * Comparable form: NFKC, case-folded, diacritics removed, Unicode sub/superscript digits → digits,
   * Greek letters → names (α → alpha), dashes/hyphens/spaces unified, apostrophes removed.
   */
  fold(input: string): string;
  /** Search tokens including hyphen/space-joined variants ("wolff-kishner" → wolff, kishner, wolffkishner). */
  tokens(input: string): readonly string[];
}

/** Mini-markup AST. Parsing is total: malformed markup degrades to literal text, never throws. */
export type RichNode =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'strong'; readonly children: readonly RichNode[] }
  | { readonly type: 'em'; readonly children: readonly RichNode[] }
  | { readonly type: 'sub'; readonly text: string }
  | { readonly type: 'sup'; readonly text: string }
  | { readonly type: 'link'; readonly target: RecordRef; readonly label: string }
  | { readonly type: 'paragraph'; readonly children: readonly RichNode[] }
  | { readonly type: 'bullets'; readonly items: readonly (readonly RichNode[])[] };

export interface RichTextParser {
  parse(source: string): readonly RichNode[];
  /** Record links found in text, for REF-008 (soft references; never block deletes). */
  links(source: string): readonly RecordRef[];
}
