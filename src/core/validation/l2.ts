/**
 * L2 findings that arise before a record exists in state: a record ID listed twice in a document
 * cannot be represented in `CanonicalState` (one slot per ID), so the document → state conversion
 * reports it and this turns the report into REF-006 findings (INV-01).
 */
import type { RecordKind } from '../schema';
import type { Finding } from './contracts';
import { makeFinding } from './findings';

export function duplicateRecordFindings(
  duplicates: readonly { readonly kind: RecordKind; readonly id: string }[],
): readonly Finding[] {
  const origin = { id: 'REF-006', level: 2, severity: 'error' } as const;
  return duplicates.map((dup) =>
    makeFinding(origin, dup, {
      path: 'id',
      message: `The ID ${dup.id} is used by more than one ${dup.kind.replace(/_/g, ' ')} record. IDs must be unique across the whole dataset.`,
    }),
  );
}
