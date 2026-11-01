/** Small builders for named reactions, mechanisms and caveats in unit tests (step 7.4). Test-only. */
import type { Caveat, Mechanism, NamedReaction, RecordRef } from '@/core/schema';
import { cptId, ident, meta } from './demo/kit';
import type { MechanismStep, MechanismVariant } from './demo/types';

export const nrxRef = (body: string): RecordRef => ({ kind: 'named_reaction', id: ident<NamedReaction['id']>('nrx', body) });
export const mecRef = (body: string): RecordRef => ({ kind: 'mechanism', id: ident<Mechanism['id']>('mec', body) });

export function namedReaction(
  body: string,
  name: string,
  o: { aliases?: string[]; parents?: string[]; summary?: string; studyNotes?: string; notes?: string; typicalConditions?: string; concepts?: string[]; prerequisites?: string[] } = {},
): NamedReaction {
  return {
    id: ident<NamedReaction['id']>('nrx', body),
    kind: 'named_reaction',
    name,
    aliases: o.aliases ?? [],
    parentIds: (o.parents ?? []).map((p) => ident<NamedReaction['id']>('nrx', p)),
    ...(o.summary === undefined ? {} : { summary: o.summary }),
    ...(o.typicalConditions === undefined ? {} : { typicalConditions: o.typicalConditions }),
    conceptIds: (o.concepts ?? []).map(cptId),
    prerequisiteConceptIds: (o.prerequisites ?? []).map(cptId),
    ...(o.studyNotes === undefined ? {} : { studyNotes: o.studyNotes }),
    ...(o.notes === undefined ? {} : { notes: o.notes }),
    ...meta(),
  };
}

export function mechStep(
  body: string,
  o: { title?: string; kinds?: MechanismStep['stepKinds']; description?: string; species?: MechanismStep['species']; rds?: boolean; reversible?: boolean; event?: string; note?: string } = {},
): MechanismStep {
  return {
    id: ident<MechanismStep['id']>('mst', body),
    ...(o.title === undefined ? {} : { title: o.title }),
    stepKinds: [...(o.kinds ?? [])],
    ...(o.description === undefined ? {} : { description: o.description }),
    species: [...(o.species ?? [])],
    bondsFormed: [],
    bondsBroken: [],
    electronMovements: [],
    ...(o.rds === undefined ? {} : { isRateDetermining: o.rds }),
    ...(o.reversible === undefined ? {} : { reversible: o.reversible }),
    ...(o.event === undefined ? {} : { stereochemicalEvent: o.event }),
    ...(o.note === undefined ? {} : { note: o.note }),
  };
}

export const mechVariant = (body: string, label: string, steps: MechanismStep[], o: { applicability?: string; rateLaw?: string } = {}): MechanismVariant => ({
  id: ident<MechanismVariant['id']>('mvr', body),
  label,
  ...(o.applicability === undefined ? {} : { applicability: o.applicability }),
  steps,
  ...(o.rateLaw === undefined ? {} : { rateLaw: o.rateLaw }),
});

export function mechanismRecord(
  body: string,
  name: string,
  variants: MechanismVariant[],
  o: { aliases?: string[]; classes?: string[]; summary?: string; studyNotes?: string; notes?: string; concepts?: string[] } = {},
): Mechanism {
  return {
    id: ident<Mechanism['id']>('mec', body),
    kind: 'mechanism',
    name,
    aliases: o.aliases ?? [],
    mechanismClasses: (o.classes ?? []).map((c) => ({ conceptId: cptId(c), certainty: 'definite' as const })),
    ...(o.summary === undefined ? {} : { summary: o.summary }),
    variants,
    conceptIds: (o.concepts ?? []).map(cptId),
    ...(o.studyNotes === undefined ? {} : { studyNotes: o.studyNotes }),
    ...(o.notes === undefined ? {} : { notes: o.notes }),
    ...meta(),
  };
}

export const caveatOn = (body: string, title: string, targets: RecordRef[]): Caveat => ({
  id: ident<Caveat['id']>('cav', body),
  kind: 'caveat',
  caveatKind: 'trap',
  title,
  statement: `${title}: statement`,
  targets: targets.map((ref) => ({ ref, as: 'affected_reaction' as const })),
  conceptIds: [],
  ...meta(),
});
