/**
 * Test vocabulary for the canonical schema: reusable value schemas (covered once across all
 * locations) and the classification of string fields. Used by the schema suite and the maximal
 * fixture coverage test.
 */
import type { z } from 'zod';
import {
  BondChangeSchema,
  CitationSchema,
  ClassificationSchema,
  ConditionParametersSchema,
  DurationSchema,
  ElectronSiteSchema,
  LabelTextSchema,
  NamesSchema,
  NameTextSchema,
  PressureSchema,
  ProvenanceSchema,
  RecordRefSchema,
  ReviewSchema,
  RichTextSchema,
  ShortTextSchema,
  SpeciesOrClassRefSchema,
  StructureRepSchema,
  SubstanceRefSchema,
  TagSchema,
  TemperatureSchema,
} from '@/core/schema';
import type { SharedNames } from './schema-walk';

export const SHARED_SCHEMAS: SharedNames = new Map<z.ZodType, string>([
  [NamesSchema, 'Names'],
  [CitationSchema, 'Citation'],
  [ProvenanceSchema, 'Provenance'],
  [ReviewSchema, 'Review'],
  [ClassificationSchema, 'Classification'],
  [StructureRepSchema, 'StructureRep'],
  [ConditionParametersSchema, 'ConditionParameters'],
  [TemperatureSchema, 'Temperature'],
  [PressureSchema, 'Pressure'],
  [DurationSchema, 'Duration'],
  [SubstanceRefSchema, 'SubstanceRef'],
  [SpeciesOrClassRefSchema, 'SpeciesOrClassRef'],
  [RecordRefSchema, 'RecordRef'],
  [BondChangeSchema, 'BondChange'],
  [ElectronSiteSchema, 'ElectronSite'],
]);

export type TextKind = 'name' | 'label' | 'tag' | 'short' | 'rich';

/** Human-readable text schemas; all reject control and bidi-override characters. */
export const TEXT_SCHEMAS: ReadonlyMap<z.ZodType, TextKind> = new Map<z.ZodType, TextKind>([
  [NameTextSchema, 'name'],
  [LabelTextSchema, 'label'],
  [TagSchema, 'tag'],
  [ShortTextSchema, 'short'],
  [RichTextSchema, 'rich'],
]);

export const SINGLE_LINE_TEXT: ReadonlySet<TextKind> = new Set<TextKind>(['name', 'label', 'tag']);

/**
 * String fields that are not human text and not pattern-constrained, with their own validation.
 * Keyed by normalised shape. Adding a plain string field anywhere else fails the schema suite,
 * forcing an explicit decision about its character rules.
 */
export const MACHINE_STRING_SHAPES: ReadonlyMap<string, string> = new Map([
  ['StructureRep.value', 'line notation / molfile; parsed by the chem worker (CHEM-001)'],
  ['class.generic.smarts', 'SMARTS query; parsed by the chem worker'],
  ['transformation.reactionSmarts', 'reaction SMARTS; parsed by the chem worker'],
  ['reaction.mappedReaction.value', 'reaction SMILES / rxnfile; parsed by the chem worker'],
  ['reference.url', 'SafeUrlSchema: http(s) only, no credentials, no control/bidi characters'],
  ['document.embeddedAssets[].base64', 'Base64Schema: alphabet and length checked; decoded and hash-checked on import (AST-003)'],
]);
