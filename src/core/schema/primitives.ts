/**
 * Shared value types — docs/DOMAIN_MODEL.md §3.
 * Schemas validate; they never transform (no defaults, no trimming, no coercion), so that
 * `parse(x)` is structurally equal to `x` and validation can never silently modify data.
 */
import { z } from 'zod';
import { ConceptIdSchema, ImportBatchIdSchema, ReferenceIdSchema } from './ids';

/** Hard caps — docs/SECURITY.md §3. Hostile or corrupted imports cannot exceed these. */
export const LIMITS = {
  name: 300,
  label: 200,
  shortText: 2_000,
  richText: 50_000,
  tag: 64,
  inlineStructure: 20_000,
  molfile: 1_000_000,
  url: 2_048,
  aliases: 64,
  tags: 64,
  citations: 64,
  idList: 256,
  properties: 64,
  participants: 64,
  stages: 16,
  conditionVariants: 16,
  outcomes: 32,
  products: 32,
  intermediates: 32,
  mechanismVariants: 16,
  mechanismSteps: 200,
  stepSpecies: 24,
  electronMovements: 64,
  routeSteps: 64,
  syllabusUnits: 200,
  topicCoverage: 500,
  attachments: 64,
  reviewReasons: 32,
} as const;

// C0 controls except TAB/LF/CR, DEL, and bidirectional override/isolate characters (spoofing).
const FORBIDDEN_MULTILINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/;
const FORBIDDEN_SINGLE_LINE = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/;

const noForbidden = (pattern: RegExp) => (value: string) => !pattern.test(value);
const notBlank = (value: string) => value.trim().length > 0;

/** Single-line, non-blank human name (entity names, titles). */
export const NameTextSchema = z
  .string()
  .max(LIMITS.name)
  .refine(notBlank, { message: 'Must not be blank' })
  .refine(noForbidden(FORBIDDEN_SINGLE_LINE), { message: 'Contains control or bidi-override characters' });

/** Single-line, non-blank short label (conditions labels, locators, descriptors). */
export const LabelTextSchema = z
  .string()
  .max(LIMITS.label)
  .refine(notBlank, { message: 'Must not be blank' })
  .refine(noForbidden(FORBIDDEN_SINGLE_LINE), { message: 'Contains control or bidi-override characters' });

/** Plain multi-line text (original wording, short notes). */
export const ShortTextSchema = z
  .string()
  .max(LIMITS.shortText)
  .refine(noForbidden(FORBIDDEN_MULTILINE), { message: 'Contains control or bidi-override characters' });

/**
 * Rich text: a plain string using ORN mini-markup (DOMAIN_MODEL.md §3.4) — emphasis, sub/superscript,
 * bullet lines and [[record links]]. Parsed to React elements; never interpreted as HTML.
 */
export const RichTextSchema = z
  .string()
  .max(LIMITS.richText)
  .refine(noForbidden(FORBIDDEN_MULTILINE), { message: 'Contains control or bidi-override characters' });

export const TagSchema = z
  .string()
  .max(LIMITS.tag)
  .refine(notBlank, { message: 'Must not be blank' })
  .refine(noForbidden(FORBIDDEN_SINGLE_LINE), { message: 'Contains control or bidi-override characters' });

export const IsoDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/, { message: 'Expected a UTC ISO-8601 timestamp' });

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Expected YYYY-MM-DD' });

export const FiniteNumberSchema = z.number().refine(Number.isFinite, { message: 'Expected a finite number' });

export const PositiveNumberSchema = z
  .number()
  .refine((n) => Number.isFinite(n) && n > 0, { message: 'Expected a positive finite number' });

export const DifficultySchema = z.number().int().min(1).max(5);

export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

/** Only http(s) URLs without credentials. Rendered as text links with rel="noopener noreferrer". */
export const SafeUrlSchema = z.string().max(LIMITS.url).refine(isSafeHttpUrl, { message: 'Only http(s) URLs are allowed' });

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    FiniteNumberSchema,
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const NamesSchema = z.strictObject({
  canonical: NameTextSchema,
  display: NameTextSchema.optional(),
  iupac: NameTextSchema.optional(),
  common: z.array(NameTextSchema).max(LIMITS.aliases),
  aliases: z.array(NameTextSchema).max(LIMITS.aliases),
  /** Disambiguates records that share a canonical name, e.g. "(generic)" or "(reagent grade)". */
  qualifier: LabelTextSchema.optional(),
});
export type Names = z.infer<typeof NamesSchema>;

export const CitationSchema = z.strictObject({
  referenceId: ReferenceIdSchema,
  locator: LabelTextSchema.optional(),
  note: ShortTextSchema.optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const ORIGINS = ['user', 'seed', 'import', 'legacy_import', 'generated'] as const;

/** Everything a legacy system stored that has no mapped home (MIGRATION.md §4). Never silently dropped. */
export const LegacyTraceSchema = z.strictObject({
  system: LabelTextSchema,
  legacyId: LabelTextSchema.optional(),
  unmapped: JsonValueSchema.optional(),
});

export const ProvenanceSchema = z.strictObject({
  origin: z.enum(ORIGINS),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  importBatchId: ImportBatchIdSchema.optional(),
  legacy: LegacyTraceSchema.optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/**
 * Human curation state. Distinct from validation findings, which are computed and stored separately.
 * `reasons` explains why review is required (set by importers or by the user).
 */
export const ReviewSchema = z.strictObject({
  lifecycle: z.enum(['draft', 'published']),
  status: z.enum(['unreviewed', 'review_required', 'verified']),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  reasons: z.array(ShortTextSchema).max(LIMITS.reviewReasons),
  reviewedAt: IsoDateTimeSchema.optional(),
});
export type Review = z.infer<typeof ReviewSchema>;

/** An explicit (user-claimed) classification. Derived suggestions are never stored. */
export const ClassificationSchema = z.strictObject({
  conceptId: ConceptIdSchema,
  certainty: z.enum(['definite', 'probable', 'possible']),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export const STRUCTURE_FORMATS = ['smiles', 'cxsmiles', 'molfile'] as const;

/** Structure exactly as entered. Canonical SMILES, formula, InChIKey etc. are derived and cached, never stored. */
export const StructureRepSchema = z
  .strictObject({
    format: z.enum(STRUCTURE_FORMATS),
    value: z.string().min(1).max(LIMITS.molfile),
  })
  .refine((s) => s.format === 'molfile' || s.value.length <= LIMITS.inlineStructure, {
    message: `Line notations are limited to ${LIMITS.inlineStructure} characters`,
    path: ['value'],
  });
export type StructureRep = z.infer<typeof StructureRepSchema>;

/** Fields shared by every non-presentation record. */
export const recordMetaShape = {
  tags: z.array(TagSchema).max(LIMITS.tags),
  citations: z.array(CitationSchema).max(LIMITS.citations),
  provenance: ProvenanceSchema,
  review: ReviewSchema,
};

/** Presentation records (layer 5) carry provenance only. */
export const presentationMetaShape = {
  provenance: ProvenanceSchema,
};
