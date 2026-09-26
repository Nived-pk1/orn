/**
 * Typed references between records — docs/DOMAIN_MODEL.md §4.
 * Which fields are references, what they may point to and what happens on delete is declared
 * once in ./references.ts (the reference registry).
 */
import { z } from 'zod';
import { AnyIdSchema, ClassIdSchema, ReagentIdSchema, RecordKindSchema, recordKindOfId, SpeciesIdSchema } from './ids';

/** A participant or reagent component: a specific species, a generic class, or a reagent record. */
export const SubstanceRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('species'), id: SpeciesIdSchema }),
  z.strictObject({ kind: z.literal('class'), id: ClassIdSchema }),
  z.strictObject({ kind: z.literal('reagent'), id: ReagentIdSchema }),
]);
export type SubstanceRef = z.infer<typeof SubstanceRefSchema>;

/** Products, intermediates and route targets: a specific species or a generic class. */
export const SpeciesOrClassRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('species'), id: SpeciesIdSchema }),
  z.strictObject({ kind: z.literal('class'), id: ClassIdSchema }),
]);
export type SpeciesOrClassRef = z.infer<typeof SpeciesOrClassRefSchema>;

/** Polymorphic reference to any record. Allowed kinds per field are declared in the reference registry. */
export const RecordRefSchema = z
  .strictObject({ kind: RecordKindSchema, id: AnyIdSchema })
  .refine((ref) => recordKindOfId(ref.id) === ref.kind, { message: 'ID prefix does not match kind', path: ['id'] });
export type RecordRef = z.infer<typeof RecordRefSchema>;
