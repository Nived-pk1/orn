/**
 * Deterministic `.orn.json` text (docs/PERSISTENCE.md §8, INV-19): records sorted by ID, object keys
 * in schema order, 2-space indent, LF, trailing newline. Key order comes from re-parsing through the
 * strict schema, so a document built with shuffled keys serialises identically. Free-form JSON
 * values (provenance.legacy.unmapped) keep their own key order: it is user data, not schema.
 */
import { DatasetDocumentSchema, type DatasetDocument } from '../schema';

export interface SerializeIssue {
  readonly path: string;
  readonly message: string;
}

export type SerializeResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly issues: readonly SerializeIssue[] };

export type DeserializeResult =
  | { readonly ok: true; readonly document: DatasetDocument }
  | { readonly ok: false; readonly issues: readonly SerializeIssue[] };

function issuesOf(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): SerializeIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));
}

export function serializeDocument(doc: DatasetDocument): SerializeResult {
  const parsed = DatasetDocumentSchema.safeParse(doc);
  if (!parsed.success) return { ok: false, issues: issuesOf(parsed.error) };
  return { ok: true, text: `${JSON.stringify(parsed.data, null, 2)}\n` };
}

/** Strict parse of one document (no migration, no quarantine: that is the importer's job, step 3.x). */
export function deserializeDocument(text: string): DeserializeResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, issues: [{ path: '', message: error instanceof Error ? error.message : 'Invalid JSON' }] };
  }
  const parsed = DatasetDocumentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: issuesOf(parsed.error) };
  return { ok: true, document: parsed.data };
}
