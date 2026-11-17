/**
 * The address and the app's state, both ways (step 8.4g, G1): what the address is NOW (the view, the open page, the family page, the record
 * the inspector shows) and how an address is carried out through the same entry points the rest of the window uses. No chemistry: a record is
 * only looked up by kind and id.
 */
import { currentOf, PAGE_VIEWS, RECORD_VIEWS, type Address, type InspectorStore, type NavigatorUiStores, type Parsed } from '@/ui/state';
import type { RecordRef } from '@/core/schema';

export interface AddressHost {
  readonly ui: NavigatorUiStores;
  readonly inspector: InspectorStore;
  /** Whether this version has the record. */
  readonly has: (kind: string, id: string) => boolean;
  /** The views this edition has. */
  readonly views: readonly string[];
  readonly setMode: (mode: string) => void;
  /** The openers of the page views, by view. */
  readonly open: Readonly<Record<string, (id: string) => void>>;
  /** Shows a record on the map the way the palette does. */
  readonly show: (ref: RecordRef) => void;
}

const EXPLORERS = ['reactions', 'precursors', 'reagents', 'named', 'mechanisms', 'syllabus'] as const;
/** The record kind each page view's pages are. */
const PAGE_KIND: Readonly<Record<string, string>> = { chapters: 'topic', reagents: 'reagent', named: 'named_reaction', mechanisms: 'mechanism' };

const openPageOf = (ui: NavigatorUiStores, view: string): string | null =>
  view === 'chapters' ? ui.chapters.getState().chapterId : view === 'reagents' ? ui.reagents.getState().reagentId : view === 'named' ? ui.named.getState().openId : view === 'mechanisms' ? ui.mechanisms.getState().openId : null;

export function currentAddress(mode: string, host: Pick<AddressHost, 'ui' | 'inspector'>): Address {
  const { ui } = host;
  const id = mode === 'chapters' ? ui.chapters.getState().chapterId : mode === 'reagents' ? ui.reagents.getState().reagentId : mode === 'named' ? ui.named.getState().openId : mode === 'mechanisms' ? ui.mechanisms.getState().openId : null;
  if (id !== null) return { t: 'page', view: mode, id };
  if (!RECORD_VIEWS.includes(mode)) return { t: 'view', view: mode };
  const family = mode === 'navigator' ? ui.family.getState().open : null;
  if (family !== null) return { t: 'family', id: family };
  const shown = currentOf(host.inspector.getState());
  return shown === null ? { t: 'view', view: mode } : { t: 'record', view: mode, kind: shown.kind, id: shown.id };
}

/** Carries out an address: `ok`, `missing` (this version has no such record), `bad` (not an address of this edition) or `none` (no address). */
export function applyAddress(host: AddressHost, parsed: Parsed): 'ok' | 'missing' | 'bad' | 'none' {
  if (parsed.t === 'none') return 'none';
  if (parsed.t === 'bad') return 'bad';
  const { ui } = host;
  if (parsed.t === 'family') {
    if (!host.has('class', parsed.id)) return 'missing';
    ui.family.getState().openFamily(parsed.id);
    host.setMode('navigator');
    return 'ok';
  }
  if (!host.views.includes(parsed.view)) return 'bad';
  if (parsed.t === 'page' ? !(parsed.view === 'chapters' && parsed.id === 'none') && !host.has(PAGE_KIND[parsed.view] ?? '', parsed.id) : parsed.t === 'record' && !host.has(parsed.kind, parsed.id)) return 'missing';
  // a page that is already open is only shown: opening it again would clear the filters the reader saved with it (a reload comes back to it)
  if (parsed.t === 'page' && PAGE_VIEWS.includes(parsed.view) && openPageOf(ui, parsed.view) !== parsed.id) {
    host.open[parsed.view]?.(parsed.id);
    return 'ok';
  }
  ui.family.getState().closeFamily();
  if (parsed.t === 'record' && parsed.view === 'navigator') {
    host.show({ kind: parsed.kind, id: parsed.id } as RecordRef);
    return 'ok';
  }
  const explorer = EXPLORERS.find((one) => one === parsed.view);
  const tab = ui.overview.getState().phoneTab;
  if (explorer !== undefined) {
    ui.overview.getState().setPhoneTab('explore');
    ui.explorer.getState().setLast(explorer);
  } else if (parsed.view === 'chapters') ui.overview.getState().setPhoneTab('chapters');
  else if (parsed.view === 'navigator' && (tab === 'explore' || tab === 'chapters')) ui.overview.getState().setPhoneTab('families');
  host.setMode(parsed.view);
  // a plain view shows no record (Back from a record lands here): the selection goes, so the address does not write it back
  if (parsed.t === 'view' && RECORD_VIEWS.includes(parsed.view)) {
    host.inspector.getState().select({ kind: 'none' });
    ui.selection.getState().select(null);
  }
  if (parsed.t === 'record') host.inspector.getState().open({ kind: parsed.kind, id: parsed.id } as RecordRef);
  return 'ok';
}
