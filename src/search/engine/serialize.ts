/**
 * The serialised index (step 4.5, SEARCH §1 "serialized index cached in derivedCache"; wiring the warm boot is Phase 5): one JSON
 * text holding MiniSearch's own export, the documents (needed for filters, titles and removal) and the format and configuration
 * the index was built under. Nothing in it is canonical (INV-11): a text that does not load is `BAD_INDEX` and the caller
 * rebuilds from the records.
 */
import MiniSearch, { type AsPlainObject } from 'minisearch';
import type { SearchDocument } from '../contracts';
import { CONFIG_ID, MINISEARCH_OPTIONS, type MiniDoc } from './config';
import { checkDocument } from './validate';

const FORMAT = 'orn.search-index';
const VERSION = 1;

interface Envelope {
  readonly format: string;
  readonly version: number;
  readonly config: string;
  readonly revision: number;
  readonly documents: readonly SearchDocument[];
  readonly index: AsPlainObject;
}

export function encodeIndex(index: MiniSearch<MiniDoc>, documents: readonly SearchDocument[], revision: number): string {
  const envelope: Envelope = { format: FORMAT, version: VERSION, config: CONFIG_ID, revision, documents, index: index.toJSON() };
  return JSON.stringify(envelope);
}

export type Decoded =
  | { readonly ok: true; readonly index: MiniSearch<MiniDoc>; readonly documents: readonly SearchDocument[] }
  | { readonly ok: false; readonly message: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Parses and checks a serialised index against the revision the caller says it belongs to. */
export function decodeIndex(json: string, revision: number): Decoded {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, message: 'the index text is not valid JSON' };
  }
  if (!isObject(parsed) || parsed.format !== FORMAT) return { ok: false, message: 'not a search index' };
  if (parsed.version !== VERSION) return { ok: false, message: `index format version ${String(parsed.version)} is not ${VERSION}` };
  if (parsed.config !== CONFIG_ID) return { ok: false, message: `index built under configuration ${String(parsed.config)}, this build uses ${CONFIG_ID}` };
  if (parsed.revision !== revision) return { ok: false, message: `index is at revision ${String(parsed.revision)}, not ${revision}` };
  const documents = parsed.documents;
  if (!Array.isArray(documents) || !isObject(parsed.index)) return { ok: false, message: 'the index text is incomplete' };
  const ids = new Set<string>();
  for (const doc of documents as unknown[]) {
    const problem = checkDocument(doc);
    const id = (doc as { id: string }).id;
    if (problem !== undefined || ids.has(id)) return { ok: false, message: problem ?? `the index repeats document ${id}` };
    ids.add(id);
  }
  let index: MiniSearch<MiniDoc>;
  try {
    index = MiniSearch.loadJS(parsed.index as unknown as AsPlainObject, MINISEARCH_OPTIONS);
  } catch (error) {
    return { ok: false, message: `MiniSearch could not load the index: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (index.documentCount !== ids.size || [...ids].some((id) => !index.has(id))) return { ok: false, message: 'the index and its documents disagree' };
  return { ok: true, index, documents: documents as SearchDocument[] };
}
