/**
 * Which records have the shared Names type (ADR-040, step 6.1a part 4). Found from the schemas themselves, never listed by kind: a kind
 * whose schema has a `names` field that IS `NamesSchema` can have its names edited by the one names editor; no kind-specific code.
 */
import { NamesSchema, RECORD_KINDS, RECORD_SCHEMAS, type RecordKind } from '../schema';

const shapeOf = (kind: RecordKind): Readonly<Record<string, unknown>> | undefined => (RECORD_SCHEMAS[kind] as unknown as { shape?: Record<string, unknown> }).shape;

/** The record kinds whose schema has the shared Names type, in registry order. */
export const NAMES_KINDS: readonly RecordKind[] = RECORD_KINDS.filter((kind) => shapeOf(kind)?.names === NamesSchema);

export const kindHasNames = (kind: string): boolean => (NAMES_KINDS as readonly string[]).includes(kind);

/** True for a record of a kind that has Names. */
export const hasNames = (record: { readonly kind: string } | undefined): boolean => record !== undefined && kindHasNames(record.kind);
