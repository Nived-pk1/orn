/**
 * Structured reaction conditions — docs/DOMAIN_MODEL.md §6.3.
 * Original wording is preserved separately (`text`, stage `originalText`); structured fields are
 * authoritative. Fields filled by a text parser and not yet confirmed are listed in `parsedFields`.
 */
import { z } from 'zod';
import { FiniteNumberSchema, LabelTextSchema, ShortTextSchema } from './primitives';

export const TEMPERATURE_UNITS = ['C', 'K'] as const;
export const QUALITATIVE_TEMPERATURES = [
  'low_temperature',
  'cold',
  'room_temperature',
  'warm',
  'heat',
  'reflux',
  'strong_heat',
] as const;

export const TemperatureSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('value'), value: FiniteNumberSchema, unit: z.enum(TEMPERATURE_UNITS) }),
  z.strictObject({
    kind: z.literal('range'),
    min: FiniteNumberSchema,
    max: FiniteNumberSchema,
    unit: z.enum(TEMPERATURE_UNITS),
  }),
  z.strictObject({ kind: z.literal('qualitative'), value: z.enum(QUALITATIVE_TEMPERATURES) }),
]);
export type Temperature = z.infer<typeof TemperatureSchema>;

export const PRESSURE_UNITS = ['atm', 'bar', 'kPa', 'mmHg'] as const;
export const PressureSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('value'), value: FiniteNumberSchema, unit: z.enum(PRESSURE_UNITS) }),
  z.strictObject({
    kind: z.literal('range'),
    min: FiniteNumberSchema,
    max: FiniteNumberSchema,
    unit: z.enum(PRESSURE_UNITS),
  }),
  z.strictObject({ kind: z.literal('qualitative'), value: z.enum(['reduced', 'atmospheric', 'high']) }),
]);

export const TIME_UNITS = ['s', 'min', 'h', 'd'] as const;
export const DurationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('value'), value: FiniteNumberSchema, unit: z.enum(TIME_UNITS) }),
  z.strictObject({ kind: z.literal('qualitative'), value: z.enum(['brief', 'prolonged']) }),
]);

export const MEDIA = ['acidic', 'basic', 'neutral', 'buffered'] as const;
export const SOLVENT_CHARACTERS = [
  'aqueous',
  'alcoholic',
  'ethereal',
  'polar_protic',
  'polar_aprotic',
  'non_polar',
  'neat',
] as const;
export const LIGHT_CONDITIONS = ['dark', 'diffuse', 'uv', 'visible', 'sunlight', 'hv'] as const;
export const ATMOSPHERES = ['air', 'inert', 'nitrogen', 'argon', 'oxygen', 'hydrogen'] as const;
export const ACTIVATIONS = ['electrolysis', 'ultrasound', 'microwave', 'radiation'] as const;

export const PARAMETER_FIELDS = [
  'temperature',
  'pressure',
  'time',
  'medium',
  'solventCharacter',
  'anhydrous',
  'light',
  'atmosphere',
  'activation',
] as const;

export const ConditionParametersSchema = z.strictObject({
  temperature: TemperatureSchema.optional(),
  pressure: PressureSchema.optional(),
  time: DurationSchema.optional(),
  medium: z.enum(MEDIA).optional(),
  solventCharacter: z.array(z.enum(SOLVENT_CHARACTERS)).max(SOLVENT_CHARACTERS.length),
  anhydrous: z.boolean().optional(),
  light: z.enum(LIGHT_CONDITIONS).optional(),
  atmosphere: z.enum(ATMOSPHERES).optional(),
  activation: z.array(z.enum(ACTIVATIONS)).max(ACTIVATIONS.length),
  /** Short qualifiers with no structured field yet, e.g. "sealed tube". */
  other: z.array(LabelTextSchema).max(16),
  /** Free-text restatement shown beside structured values. */
  text: ShortTextSchema.optional(),
  /** Fields a parser filled from text that a person has not yet confirmed (→ REVIEW_REQUIRED). */
  parsedFields: z.array(z.enum(PARAMETER_FIELDS)).max(PARAMETER_FIELDS.length),
});
export type ConditionParameters = z.infer<typeof ConditionParametersSchema>;
