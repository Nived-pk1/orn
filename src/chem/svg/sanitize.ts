/**
 * The SVG sanitiser (docs/SECURITY.md §2, ADR-009). Pure string work, no DOMParser (workers have none): the input is
 * tokenised, only whitelisted elements and attributes are kept, and the output is WRITTEN by this file from those parts with
 * escaping, never copied from the input, so nothing the input says can become markup. Dropped without a trace in the output
 * but always COUNTED in the report (CLAUDE.md §1.5): comments, CDATA, the XML declaration and processing instructions,
 * metadata and every other element outside the whitelist together with its content, namespaced elements, attributes and style
 * declarations that are not whitelisted or fail their value check. Refused as a value: an input over the cap, a DOCTYPE or any
 * other `<!` declaration (so no entity can be defined), nesting deeper than the cap, and input with no `svg` root.
 * Bounded (one linear pass; the open-element stack is capped) and idempotent: sanitising the output changes nothing.
 */
import { buildAttributes } from './attributes';
import { readStartTag } from './tag';
import { decode, escape } from './text';
import { hasForbiddenContent } from './values';
import { ELEMENTS, SVG_NAMESPACE, TEXT_ELEMENTS } from './whitelist';

/** Longest input accepted, in characters (2 MiB). RDKit writes about 2-30 KB per molecule; a 5 MB "depiction" is not one. */
export const MAX_SVG_INPUT_CHARS = 2 * 1024 * 1024;
/** Deepest element nesting accepted (kept or dropped); RDKit's is 2. */
export const MAX_SVG_NESTING = 256;
export const MAX_SVG_ATTRIBUTES = 64;
/** Longest text node kept, in characters. */
const MAX_TEXT_CHARS = 1_000;

export interface SanitizeReport {
  readonly elementsKept: number;
  /** Start tags dropped, whitelisted or not, including everything inside a dropped element. */
  readonly elementsDropped: number;
  readonly attributesDropped: number;
  readonly styleDeclarationsDropped: number;
  readonly stylesRefused: number;
  readonly commentsDropped: number;
  readonly cdataDropped: number;
  /** The XML declaration and other processing instructions. */
  readonly processingInstructionsDropped: number;
  /** Text nodes with something in them that were not kept (outside `text`/`tspan`, too long, or forbidden content). */
  readonly textDropped: number;
  readonly strayEndTags: number;
  /** Elements still open at the end of the input, closed by the sanitiser. */
  readonly autoClosed: number;
  /** Numeric references to characters XML forbids. */
  readonly badReferences: number;
  /** Markup that never ended (an unfinished tag, comment, CDATA section or instruction): the rest of the input was dropped. */
  readonly truncated: number;
}

export type SanitizeRefusal = 'too_large' | 'declaration' | 'too_deep' | 'no_svg';

export type SanitizeOutcome =
  | { readonly ok: true; readonly svg: string; readonly report: SanitizeReport }
  | { readonly ok: false; readonly reason: SanitizeRefusal; readonly message: string };

type Counters = { -readonly [K in keyof SanitizeReport]: SanitizeReport[K] };
interface Frame {
  readonly name: string;
  readonly kept: boolean;
}

const refuse = (reason: SanitizeRefusal, message: string): SanitizeOutcome => ({ ok: false, reason, message });
const NAME_START = /[A-Za-z_:]/;

export function sanitizeSvg(input: string): SanitizeOutcome {
  if (input.length > MAX_SVG_INPUT_CHARS) {
    return refuse('too_large', `the SVG has ${input.length} characters; the limit is ${MAX_SVG_INPUT_CHARS} (2 MiB)`);
  }
  const report: Counters = {
    elementsKept: 0,
    elementsDropped: 0,
    attributesDropped: 0,
    styleDeclarationsDropped: 0,
    stylesRefused: 0,
    commentsDropped: 0,
    cdataDropped: 0,
    processingInstructionsDropped: 0,
    textDropped: 0,
    strayEndTags: 0,
    autoClosed: 0,
    badReferences: 0,
    truncated: 0,
  };
  const out: string[] = [];
  const stack: Frame[] = [];
  const open = new Map<string, number>();
  let rootSeen = false;
  const n = input.length;
  let i = 0;

  const takeText = (raw: string): void => {
    const top = stack[stack.length - 1];
    if (top?.kept === true && TEXT_ELEMENTS.has(top.name)) {
      const decoded = decode(raw);
      report.badReferences += decoded.badReferences;
      if (decoded.text.length > MAX_TEXT_CHARS || hasForbiddenContent(decoded.text)) report.textDropped += 1;
      else out.push(escape(decoded.text));
    } else if (raw.trim() !== '') report.textDropped += 1;
  };

  const push = (name: string, kept: boolean): void => {
    stack.push({ name, kept });
    open.set(name, (open.get(name) ?? 0) + 1);
  };

  const pop = (): Frame => {
    const frame = stack.pop() as Frame;
    open.set(frame.name, (open.get(frame.name) ?? 1) - 1);
    if (frame.kept) out.push(`</${frame.name}>`);
    return frame;
  };

  const closeElement = (name: string): void => {
    if ((open.get(name) ?? 0) === 0) {
      report.strayEndTags += 1;
      return;
    }
    while (stack.length > 0 && pop().name !== name) continue;
  };

  while (i < n) {
    const lt = input.indexOf('<', i);
    const textEnd = lt === -1 ? n : lt;
    if (textEnd > i) takeText(input.slice(i, textEnd));
    if (lt === -1) break;
    i = lt;
    const next = input.charAt(i + 1);

    if (next === '!') {
      const isComment = input.startsWith('<!--', i);
      if (!isComment && !input.startsWith('<![CDATA[', i)) {
        return refuse('declaration', 'the SVG contains a DOCTYPE or another <! declaration; none is accepted (no entity may be defined)');
      }
      const end = input.indexOf(isComment ? '-->' : ']]>', i + 4);
      if (isComment) report.commentsDropped += 1;
      else report.cdataDropped += 1;
      if (end === -1) report.truncated += 1;
      i = end === -1 ? n : end + 3;
    } else if (next === '?') {
      const end = input.indexOf('?>', i + 2);
      report.processingInstructionsDropped += 1;
      if (end === -1) report.truncated += 1;
      i = end === -1 ? n : end + 2;
    } else if (next === '/') {
      const end = input.indexOf('>', i + 2);
      if (end === -1) {
        report.truncated += 1;
        i = n;
      } else {
        closeElement(input.slice(i + 2, end).trim());
        i = end + 1;
      }
    } else if (next !== '' && NAME_START.test(next)) {
      const tag = readStartTag(input, i + 1, MAX_SVG_ATTRIBUTES);
      if (tag.kind === 'unterminated') {
        report.truncated += 1;
        i = n;
        continue;
      }
      i = tag.end;
      report.attributesDropped += tag.overflow;
      const parent = stack[stack.length - 1];
      const keep = ELEMENTS.has(tag.name) && (parent === undefined ? tag.name === 'svg' && !rootSeen : parent.kept);
      if (!tag.selfClosing && stack.length >= MAX_SVG_NESTING) {
        return refuse('too_deep', `the SVG nests elements more than ${MAX_SVG_NESTING} deep`);
      }
      if (!keep) {
        report.elementsDropped += 1;
        if (!tag.selfClosing) push(tag.name, false);
        continue;
      }
      report.elementsKept += 1;
      if (parent === undefined) rootSeen = true;
      const namespace = tag.name === 'svg' ? ` xmlns="${SVG_NAMESPACE}"` : '';
      out.push(`<${tag.name}${namespace}${buildAttributes(tag.attributes, report)}>`);
      if (tag.selfClosing) out.push(`</${tag.name}>`);
      else push(tag.name, true);
    } else {
      takeText('<'); // a stray "<" is character data, and is never written as markup
      i += 1;
    }
  }

  report.autoClosed += stack.length;
  while (stack.length > 0) pop();
  if (!rootSeen) return refuse('no_svg', 'the input has no svg element to keep');
  return { ok: true, svg: out.join(''), report };
}
