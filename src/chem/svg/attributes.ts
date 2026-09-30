/**
 * Turns the raw attributes of a KEPT element into the text the sanitiser writes: only whitelisted names, only values that pass
 * their validator, `style` declaration by declaration (a style with a url, `expression`, `@`, a backslash or `<` is refused
 * whole). Everything dropped is counted, never silent. Pure.
 */
import type { RawAttribute } from './tag';
import { decode, escape } from './text';
import { hasForbiddenContent, styleIsRefused, validateValue } from './values';
import { attributeKind, styleKind } from './whitelist';

/** The counters of `SanitizeReport` this file adds to. */
export interface AttributeCounters {
  attributesDropped: number;
  styleDeclarationsDropped: number;
  stylesRefused: number;
  badReferences: number;
}

function cleanStyle(raw: string, counters: AttributeCounters): string | undefined {
  const decoded = decode(raw);
  counters.badReferences += decoded.badReferences;
  if (styleIsRefused(raw) || styleIsRefused(decoded.text)) {
    counters.stylesRefused += 1;
    return undefined;
  }
  const kept: string[] = [];
  for (const declaration of decoded.text.split(';')) {
    const text = declaration.trim();
    if (text === '') continue;
    const colon = text.indexOf(':');
    const property = colon > 0 ? text.slice(0, colon).trim().toLowerCase() : '';
    const kind = styleKind(property);
    const value = kind === undefined ? undefined : validateValue(kind, text.slice(colon + 1));
    if (value === undefined || value === '' || hasForbiddenContent(value)) counters.styleDeclarationsDropped += 1;
    else kept.push(`${property}:${value}`);
  }
  return kept.length === 0 ? undefined : kept.join(';');
}

function cleanValue(name: string, raw: string, counters: AttributeCounters): string | undefined {
  if (name === 'style') return cleanStyle(raw, counters);
  const kind = attributeKind(name);
  if (kind === undefined) return undefined;
  const decoded = decode(raw);
  counters.badReferences += decoded.badReferences;
  const value = validateValue(kind, decoded.text);
  return value === undefined || value === '' || hasForbiddenContent(value) ? undefined : value;
}

/** ` name="value"` pairs, in input order, each name at most once (the first wins). */
export function buildAttributes(raw: readonly RawAttribute[], counters: AttributeCounters): string {
  const seen = new Set<string>();
  let text = '';
  for (const { name, value } of raw) {
    if (seen.has(name)) {
      counters.attributesDropped += 1;
      continue;
    }
    seen.add(name);
    const clean = cleanValue(name, value, counters);
    if (clean === undefined) counters.attributesDropped += 1;
    else text += ` ${name}="${escape(clean)}"`;
  }
  return text;
}
