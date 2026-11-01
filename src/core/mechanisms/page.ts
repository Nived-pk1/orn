/**
 * One mechanism's page (7.4 C): summary, aliases, classes, concepts, the variants with their ordered steps in words (step kinds with "_" as a
 * space, species roles as words, rate-determining, reversible, the stereochemical event, notes), the rate law, applicability, the reactions
 * that use it (examples folded), the caveats on it and on those reactions, and its chapters. The steps' curved arrows are not part of the
 * page (Phase 8). Pure and derived.
 */
import type { ReadonlyIndexes } from '../indexes/contracts';
import type { CanonicalState, MechanismId, StructureRep, SubstanceRef } from '../schema';
import { caveatLines, chaptersOfRecord, foldedReactions, linkOf, sortByName, type CaveatLine, type FoldedReactions, type Link } from '../study-pages';

export interface StepSpeciesView {
  /** The role in words: "transition state". */
  readonly role: string;
  /** The label written on the step, else the name of the record it points to; undefined when it has only a structure. */
  readonly label: string | undefined;
  readonly structure?: StructureRep;
}

export interface StepView {
  readonly id: string;
  /** 1-based, in the order of the variant. */
  readonly number: number;
  readonly title: string | undefined;
  /** "proton transfer", "nucleophilic attack". */
  readonly kinds: readonly string[];
  readonly description: string | undefined;
  readonly species: readonly StepSpeciesView[];
  readonly rateDetermining: boolean;
  readonly reversible: boolean;
  readonly stereochemicalEvent: string | undefined;
  readonly note: string | undefined;
}

export interface VariantView {
  readonly id: string;
  readonly label: string;
  readonly applicability: string | undefined;
  readonly rateLaw: string | undefined;
  readonly note: string | undefined;
  readonly steps: readonly StepView[];
}

export interface MechanismPage {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly classes: readonly { readonly id: string; readonly name: string; readonly certainty: string }[];
  readonly summary: string | undefined;
  readonly studyNotes: string | undefined;
  readonly notes: string | undefined;
  readonly concepts: readonly Link[];
  readonly variants: readonly VariantView[];
  readonly reactions: FoldedReactions;
  readonly caveats: readonly CaveatLine[];
  readonly chapters: readonly Link[];
}

const words = (value: string): string => value.replaceAll('_', ' ');

function nameOfRef(state: CanonicalState, ref: SubstanceRef): string | undefined {
  const record = (state.records[ref.kind] as Readonly<Record<string, { readonly names?: { readonly canonical: string; readonly display?: string } } | undefined>>)[ref.id];
  return record?.names?.display ?? record?.names?.canonical;
}

export function mechanismPage(state: CanonicalState, indexes: ReadonlyIndexes, id: string): MechanismPage | undefined {
  const record = state.records.mechanism[id as MechanismId];
  if (record === undefined) return undefined;
  const reactionIds = indexes.reactionsByMechanism(id as MechanismId);
  return {
    id,
    name: record.name,
    aliases: record.aliases,
    classes: record.mechanismClasses.flatMap((one) => {
      const concept = state.records.concept[one.conceptId];
      return concept === undefined ? [] : [{ id: concept.id as string, name: concept.name, certainty: one.certainty }];
    }),
    summary: record.summary,
    studyNotes: record.studyNotes,
    notes: record.notes,
    concepts: sortByName(record.conceptIds.flatMap((conceptId) => linkOf(state, 'concept', conceptId) ?? [])),
    variants: record.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      applicability: variant.applicability,
      rateLaw: variant.rateLaw,
      note: variant.note,
      steps: variant.steps.map((step, index) => ({
        id: step.id,
        number: index + 1,
        title: step.title,
        kinds: step.stepKinds.map(words),
        description: step.description,
        species: step.species.map((one) => {
          const label = one.label ?? (one.ref === undefined ? undefined : nameOfRef(state, one.ref));
          return { role: words(one.role), label, ...(one.structure === undefined ? {} : { structure: one.structure }) };
        }),
        rateDetermining: step.isRateDetermining === true,
        reversible: step.reversible === true,
        stereochemicalEvent: step.stereochemicalEvent,
        note: step.note,
      })),
    })),
    reactions: foldedReactions(state, reactionIds),
    caveats: caveatLines(state, indexes, [{ kind: 'mechanism', id } as never, ...reactionIds.map((reactionId) => ({ kind: 'reaction', id: reactionId }) as never)]),
    chapters: chaptersOfRecord(state, { kind: 'mechanism', id } as never),
  };
}
