/**
 * Mini-markup parser — docs/DOMAIN_MODEL.md §3.4, ADR-021.
 *
 * Rich text is never HTML or Markdown. Parsing is total (never throws) and malformed markup degrades to
 * literal text, so no input character is ever dropped. Bounds:
 *  - inline nesting depth ≤ MAX_DEPTH; deeper content is kept as literal text;
 *  - all closer searches share a work budget linear in the source length; once spent, remaining openers
 *    are literal. Well-formed text never comes near it; adversarial text cannot cost more than O(n).
 */
import { recordKindOfId, type RecordRef } from '../schema';
import type { RichNode, RichTextParser } from './contracts';

const MAX_DEPTH = 4;
const BUDGET_BASE = 1_000;
const BUDGET_PER_CHAR = 50;

interface Context {
  budget: number;
}

interface Parsed {
  readonly node: RichNode;
  readonly next: number;
}

class Sink {
  private readonly nodes: RichNode[] = [];
  private buffer = '';

  text(value: string): void {
    this.buffer += value;
  }

  push(node: RichNode): void {
    this.flush();
    this.nodes.push(node);
  }

  done(): RichNode[] {
    this.flush();
    return this.nodes;
  }

  private flush(): void {
    if (this.buffer !== '') this.nodes.push({ type: 'text', text: this.buffer });
    this.buffer = '';
  }
}

const isSpace = (ch: string | undefined): boolean => ch === undefined || /\s/u.test(ch);

/** indexOf that charges the scanned length to the budget. */
function findEnd(src: string, from: number, token: string, ctx: Context): number {
  if (ctx.budget <= 0) return -1;
  const index = src.indexOf(token, from);
  ctx.budget -= (index < 0 ? src.length : index) - from + 1;
  return index;
}

/**
 * Closing delimiter for emphasis opened just before `from`. A closer must directly follow non-space text.
 * Nested emphasis of the other kind is skipped so `*a **b** c*` pairs correctly.
 */
function findEmphasisClose(src: string, from: number, delimiter: '*' | '**', ctx: Context): number {
  let i = from;
  while (i < src.length) {
    if (--ctx.budget < 0) return -1;
    if (src[i] !== '*') {
      i++;
      continue;
    }
    const double = src.startsWith('**', i);
    const closable = i > from && !isSpace(src[i - 1]);
    if (delimiter === '**') {
      if (double && closable) return i;
      i += double ? 2 : 1;
    } else {
      if (!double && closable) return i;
      i += double ? 2 : 1;
    }
  }
  return -1;
}

function parseEmphasis(src: string, at: number, depth: number, ctx: Context): Parsed | undefined {
  const delimiter = src.startsWith('**', at) ? '**' : '*';
  const start = at + delimiter.length;
  if (isSpace(src[start])) return undefined;
  const close = findEmphasisClose(src, start, delimiter, ctx);
  if (close < 0) return undefined;
  const children = parseInline(src.slice(start, close), depth + 1, ctx);
  return { node: { type: delimiter === '**' ? 'strong' : 'em', children }, next: close + delimiter.length };
}

function parseScript(src: string, at: number, ctx: Context): Parsed | undefined {
  const end = findEnd(src, at + 2, '}', ctx);
  if (end < 0) return undefined;
  const text = src.slice(at + 2, end);
  if (text === '' || text.includes('\n')) return undefined;
  return { node: { type: src[at] === '_' ? 'sub' : 'sup', text }, next: end + 1 };
}

function parseLink(src: string, at: number, ctx: Context): Parsed | undefined {
  const end = findEnd(src, at + 2, ']]', ctx);
  if (end < 0) return undefined;
  const inner = src.slice(at + 2, end);
  if (inner.includes('\n')) return undefined;
  const bar = inner.indexOf('|');
  const id = bar < 0 ? inner : inner.slice(0, bar);
  const label = bar < 0 ? id : inner.slice(bar + 1);
  const kind = recordKindOfId(id);
  if (kind === undefined || label === '') return undefined;
  return { node: { type: 'link', target: { kind, id }, label }, next: end + 2 };
}

function parseInline(src: string, depth: number, ctx: Context): RichNode[] {
  if (depth > MAX_DEPTH) return src === '' ? [] : [{ type: 'text', text: src }];
  const sink = new Sink();
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    let parsed: Parsed | undefined;
    let literalLength = 1;
    if (ch === '*') {
      parsed = parseEmphasis(src, i, depth, ctx);
      if (src.startsWith('**', i)) literalLength = 2;
    } else if ((ch === '_' || ch === '^') && src[i + 1] === '{') {
      parsed = parseScript(src, i, ctx);
    } else if (ch === '[' && src[i + 1] === '[') {
      parsed = parseLink(src, i, ctx);
    }
    if (parsed) {
      sink.push(parsed.node);
      i = parsed.next;
    } else {
      sink.text(src.slice(i, i + literalLength));
      i += literalLength;
    }
  }
  return sink.done();
}

export function parseRichText(source: string): readonly RichNode[] {
  const ctx: Context = { budget: BUDGET_BASE + BUDGET_PER_CHAR * source.length };
  const out: RichNode[] = [];
  let paragraph: string[] = [];
  let items: RichNode[][] = [];

  const flushParagraph = (): void => {
    if (paragraph.length > 0) out.push({ type: 'paragraph', children: parseInline(paragraph.join('\n'), 0, ctx) });
    paragraph = [];
  };
  const flushItems = (): void => {
    if (items.length > 0) out.push({ type: 'bullets', items });
    items = [];
  };

  for (const line of source.split(/\r\n|\r|\n/)) {
    if (line.trim() === '') {
      flushParagraph();
      flushItems();
    } else if (line.startsWith('- ')) {
      flushParagraph();
      items.push(parseInline(line.slice(2), 0, ctx));
    } else {
      flushItems();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushItems();
  return out;
}

function collectLinks(nodes: readonly RichNode[], into: Map<string, RecordRef>): void {
  for (const node of nodes) {
    if (node.type === 'link') {
      const key = `${node.target.kind}:${node.target.id}`;
      if (!into.has(key)) into.set(key, node.target);
    } else if (node.type === 'strong' || node.type === 'em' || node.type === 'paragraph') {
      collectLinks(node.children, into);
    } else if (node.type === 'bullets') {
      for (const item of node.items) collectLinks(item, into);
    }
  }
}

/** Distinct record links in order of first appearance. */
export function richTextLinks(source: string): readonly RecordRef[] {
  const found = new Map<string, RecordRef>();
  collectLinks(parseRichText(source), found);
  return [...found.values()];
}

export const richTextParser: RichTextParser = { parse: parseRichText, links: richTextLinks };
