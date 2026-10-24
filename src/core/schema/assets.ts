/**
 * Binary attachments (layer 4) — docs/PERSISTENCE.md §5, docs/SECURITY.md §2.
 * Metadata lives here; bytes live in the assetBlobs store (or in the package / embedded export).
 * An image is never the only representation of chemistry: deleting an asset never invalidates
 * chemistry records (INV-17). Images are displayed via <img>/<image> only, never inlined as markup.
 */
import { z } from 'zod';
import { AssetIdSchema } from './ids';
import { LabelTextSchema, LIMITS, recordMetaShape, RichTextSchema, ShortTextSchema } from './primitives';
import { RecordRefSchema } from './refs';

export const ASSET_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'] as const;
export const ASSET_ROLES = [
  'structure_image',
  'reaction_image',
  'mechanism_image',
  'reagent_image',
  'reference_image',
  'legacy_image',
] as const;
export const MAX_ASSET_BYTES = 20 * 1024 * 1024;

export const AssetSchema = z.strictObject({
  id: AssetIdSchema,
  kind: z.literal('asset'),
  mediaType: z.enum(ASSET_MEDIA_TYPES),
  byteSize: z.number().int().min(1).max(MAX_ASSET_BYTES),
  /** Content hash of the bytes; verified on import (AST-003) and used for de-duplication. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  width: z.number().int().min(1).max(32_768).optional(),
  height: z.number().int().min(1).max(32_768).optional(),
  /** Sanitised base name only; never a path. */
  filename: LabelTextSchema.optional(),
  altText: ShortTextSchema.optional(),
  assetRole: z.enum(ASSET_ROLES),
  attachedTo: z
    .array(z.strictObject({ ref: RecordRefSchema, note: ShortTextSchema.optional() }))
    .max(LIMITS.attachments),
  caption: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type Asset = z.infer<typeof AssetSchema>;
export type AssetRole = (typeof ASSET_ROLES)[number];
