/**
 * The address of the app (step 8.4g, G1; ADR-047): what follows `#` names a view and, where it has one, a record. Pure text in and out;
 * the window turns it into state and back. IDs only, never names. Anything unknown, long or malformed parses as `bad` (the not-found screen).
 *
 *   #/<view>                   a view (the map is `map`)
 *   #/<view>/<id>              the page of a chapter, reagent, named reaction or mechanism; a reaction in Reactions
 *   #/<view>/<kind>/<id>       a record shown in the inspector (on the map, Reactions or Precursors); `family` is the class kind
 *   #/family/<id>              the family page
 * The map's zoom and pan are not in the address.
 */
import { RECORD_KINDS } from '@/core/schema';

export type Address =
  | { readonly t: 'view'; readonly view: string }
  | { readonly t: 'page'; readonly view: string; readonly id: string }
  | { readonly t: 'family'; readonly id: string }
  | { readonly t: 'record'; readonly view: string; readonly kind: string; readonly id: string };
export type Parsed = Address | { readonly t: 'none' } | { readonly t: 'bad' };

const SLUGS: Readonly<Record<string, string>> = { navigator: 'map' };
const VIEWS = ['navigator', 'chapters', 'dataset', 'reactions', 'precursors', 'reagents', 'named', 'mechanisms', 'syllabus', 'settings', 'workbench', 'review'];
/** Views with a page of their own (the second part is the page's id). */
export const PAGE_VIEWS: readonly string[] = ['chapters', 'reagents', 'named', 'mechanisms'];
/** Views that can show a record in the inspector (the second and third parts are its kind and id). */
export const RECORD_VIEWS: readonly string[] = ['navigator', 'reactions', 'precursors'];
const MAX_HASH = 600;
const MAX_ID = 200;

export const slugOf = (view: string): string => SLUGS[view] ?? view;
const viewOf = (slug: string): string | undefined => VIEWS.find((view) => slugOf(view) === slug);
const kindSlug = (kind: string): string => (kind === 'class' ? 'family' : kind);
const kindOf = (slug: string): string | undefined => (slug === 'family' ? 'class' : (RECORD_KINDS as readonly string[]).includes(slug) ? slug : undefined);
const idOf = (part: string | undefined): string | undefined => {
  if (part === undefined || part === '' || part.length > MAX_ID * 3) return undefined;
  try {
    const id = decodeURIComponent(part);
    return id.length > MAX_ID || id.includes('/') || [...id].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ? undefined : id;
  } catch {
    return undefined;
  }
};

export function formatAddress(address: Address): string {
  if (address.t === 'family') return `#/family/${encodeURIComponent(address.id)}`;
  const base = `#/${slugOf(address.view)}`;
  if (address.t === 'view') return base;
  if (address.t === 'page') return `${base}/${encodeURIComponent(address.id)}`;
  const id = encodeURIComponent(address.id);
  return address.view === 'reactions' && address.kind === 'reaction' ? `${base}/${id}` : `${base}/${kindSlug(address.kind)}/${id}`;
}

export function parseAddress(hash: string): Parsed {
  if (hash === '' || hash === '#' || hash === '#/') return { t: 'none' };
  const bad: Parsed = { t: 'bad' };
  if (hash.length > MAX_HASH || !hash.startsWith('#/')) return bad;
  const parts = hash.slice(2).split('/');
  const [first, second, third] = parts;
  if (first === 'family') {
    const id = idOf(second);
    return parts.length === 2 && id !== undefined ? { t: 'family', id } : bad;
  }
  const view = first === undefined ? undefined : viewOf(first);
  if (view === undefined || parts.length > 3) return bad;
  if (parts.length === 1) return { t: 'view', view };
  if (parts.length === 2) {
    const id = idOf(second);
    if (id === undefined) return bad;
    if (PAGE_VIEWS.includes(view)) return { t: 'page', view, id };
    return view === 'reactions' ? { t: 'record', view, kind: 'reaction', id } : bad;
  }
  const kind = second === undefined ? undefined : kindOf(second);
  const id = idOf(third);
  return kind === undefined || id === undefined || !RECORD_VIEWS.includes(view) ? bad : { t: 'record', view, kind, id };
}

/** The address that opens a record from anywhere: a reaction in Reactions, a family on the map, anything else on the map. */
export function recordAddress(ref: { readonly kind: string; readonly id: string }): Address {
  return { t: 'record', view: ref.kind === 'reaction' ? 'reactions' : 'navigator', kind: ref.kind, id: ref.id };
}
