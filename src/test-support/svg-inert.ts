/**
 * An INDEPENDENT check that an SVG string is inert (step 4.3a), written without the sanitiser's scanner so a bug shared by both
 * cannot hide: the string must be one well-formed, balanced tree of whitelisted elements with double-quoted, whitelisted
 * attributes, its text must be escaped, and it must not contain a reference, a script, a declaration or an event handler
 * anywhere, in any case. Returns the problems found (empty = inert). Test-only.
 */
import { ELEMENTS, PRESENTATION, GEOMETRY, SVG_NAMESPACE } from '@/chem/svg/whitelist';

/** The property the plan states: output never contains these, in any case. */
export const FORBIDDEN_IN_OUTPUT: readonly RegExp[] = [/<script/i, /\bon[a-z]+\s*=/i, /href/i, /url\s*\(/i, /<!/, /<\?/, /javascript:/i, /expression\s*\(/i, /@import/i];

const TAG = /<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z:-]+="[^"<>]*")*)\s*>/y;
const ATTRIBUTE = /\s+([A-Za-z:-]+)="([^"]*)"/g;
const ALLOWED_ATTRIBUTES: ReadonlySet<string> = new Set(['xmlns', 'style', ...Object.keys(GEOMETRY), ...Object.keys(PRESENTATION)]);
const BAD_ENTITY = /&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9A-Fa-f]+);)/;

export function inertProblems(svg: string): string[] {
  const problems: string[] = [];
  for (const pattern of FORBIDDEN_IN_OUTPUT) if (pattern.test(svg)) problems.push(`contains ${String(pattern)}`);
  if (!svg.startsWith(`<svg xmlns="${SVG_NAMESPACE}"`)) problems.push('does not start with the svg root and its namespace');

  const stack: string[] = [];
  let at = 0;
  let closedRoot = false;
  while (at < svg.length) {
    if (svg.charAt(at) !== '<') {
      const next = svg.indexOf('<', at);
      const text = svg.slice(at, next === -1 ? svg.length : next);
      if (stack.length === 0) problems.push('text outside the root');
      if (text.includes('>') || BAD_ENTITY.test(text)) problems.push(`unescaped text ${JSON.stringify(text.slice(0, 30))}`);
      at = next === -1 ? svg.length : next;
      continue;
    }
    TAG.lastIndex = at;
    const match = TAG.exec(svg);
    if (match === null) {
      problems.push(`not a tag at ${at}: ${JSON.stringify(svg.slice(at, at + 40))}`);
      break;
    }
    const [whole, closing, name = '', attributes = ''] = match;
    if (!ELEMENTS.has(name)) problems.push(`element ${name} is not whitelisted`);
    if (closing === '/') {
      if (stack.pop() !== name) problems.push(`unbalanced </${name}>`);
      if (stack.length === 0) closedRoot = true;
    } else {
      if (stack.length === 0 && (name !== 'svg' || closedRoot)) problems.push(`second root or a root that is not svg: ${name}`);
      stack.push(name);
      for (const attribute of attributes.matchAll(ATTRIBUTE)) {
        const [, attributeName = '', value = ''] = attribute;
        if (!ALLOWED_ATTRIBUTES.has(attributeName)) problems.push(`attribute ${attributeName} is not whitelisted`);
        if (BAD_ENTITY.test(value)) problems.push(`unescaped attribute value ${JSON.stringify(value.slice(0, 30))}`);
      }
    }
    at += whole.length;
  }
  if (stack.length !== 0) problems.push(`unclosed: ${stack.join(',')}`);
  return problems;
}
