/**
 * What each kind contributes to a document, before the common fields (scope, topics, facets) are added (step 4.5). Every part is
 * built from THE RECORD ITSELF ONLY: no document contains the name or text of another record (ids stay ids). That is a design
 * rule, not an accident: a rename never has to refresh any document but the renamed record's own.
 */
import type { AnyRecord, Names, Reagent } from '@/core/schema';
import { distinct, TextPieces } from './pieces';

export interface Part {
  readonly title: string;
  readonly names: readonly string[];
  readonly aliases: readonly string[];
  readonly formula?: string;
  readonly structureText?: string;
  readonly pieces: TextPieces;
}

/** Canonical, display, IUPAC, common names; aliases apart. The title prefers the display name. */
function namesPart(names: Names): Pick<Part, 'title' | 'names' | 'aliases'> {
  return {
    title: names.display ?? names.canonical,
    names: distinct([names.canonical, names.display, names.iupac, ...names.common]),
    aliases: distinct(names.aliases),
  };
}

const named = (name: string, aliases: readonly string[]): Pick<Part, 'title' | 'names' | 'aliases'> => ({
  title: name,
  names: distinct([name]),
  aliases: distinct(aliases),
});

const trimmed = (value: string | undefined): string | undefined => (value === undefined || value.trim() === '' ? undefined : value.trim());

/** `{ [key]: value }` when the value is present, else nothing (exactOptionalPropertyTypes). */
function optional<K extends 'formula' | 'structureText'>(key: K, value: string | undefined): { [P in K]?: string } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]?: string });
}

function reagentAliases(reagent: Reagent): readonly string[] {
  return [...reagent.names.aliases, ...reagent.profiles.flatMap((profile) => [profile.label, ...profile.aliases])];
}

/** The part of a record, or undefined for a kind that is not indexed (SEARCH §1: relationships, curriculum structure, assets, presentation). */
export function partOf(record: AnyRecord): Part | undefined {
  switch (record.kind) {
    case 'species': {
      const pieces = new TextPieces().add(record.isotopeNote, ...(record.stereo?.descriptors ?? [])).rich(record.stereo?.note);
      for (const property of record.properties) pieces.add(property.label, property.value).rich(property.note);
      pieces.rich(record.acidBaseNotes, record.studyNotes, record.notes);
      return { ...namesPart(record.names), ...optional('formula', trimmed(record.formula)), ...optional('structureText', trimmed(record.structure?.value)), pieces };
    }
    case 'class': {
      const pieces = new TextPieces().rich(record.generic?.rGroupNote, record.description, record.studyNotes, record.notes);
      const formula = distinct([record.generic?.formulaText, record.generic?.generalFormula]).join(' ');
      return { ...namesPart(record.names), ...optional('formula', trimmed(formula)), ...optional('structureText', trimmed(record.generic?.structure?.value)), pieces };
    }
    case 'reagent': {
      const pieces = new TextPieces();
      for (const profile of record.profiles) pieces.rich(profile.behaviour);
      pieces.rich(record.description, record.studyNotes, record.notes);
      return { ...namesPart(record.names), aliases: distinct(reagentAliases(record)), ...optional('formula', trimmed(record.formulaText)), pieces };
    }
    case 'reaction': {
      const pieces = new TextPieces().add(record.generalizedEquation);
      for (const participant of record.participants) pieces.add(participant.originalText).rich(participant.note);
      for (const stage of record.stages) pieces.add(stage.label, stage.originalText);
      for (const variant of record.conditionVariants) pieces.add(variant.label).rich(variant.note);
      for (const outcome of record.outcomes) {
        pieces.add(outcome.label, outcome.regiochemistry, outcome.yieldText, ...(outcome.stereochemistry?.descriptors ?? []));
        pieces.rich(outcome.rationale, outcome.note, outcome.stereochemistry?.note);
        for (const product of outcome.products) pieces.add(product.originalText).rich(product.note);
      }
      for (const intermediate of record.intermediates) pieces.add(intermediate.label).rich(intermediate.note);
      pieces.rich(record.reversibility.note, record.selectivityNotes?.regio, record.selectivityNotes?.stereo, record.selectivityNotes?.chemo);
      pieces.rich(record.limitations, record.studyNotes, record.notes);
      return { ...named(record.name, record.aliases), pieces };
    }
    case 'named_reaction':
      return { ...named(record.name, record.aliases), pieces: new TextPieces().rich(record.summary, record.typicalConditions, record.studyNotes, record.notes) };
    case 'concept':
      return { ...named(record.name, record.aliases), pieces: new TextPieces().rich(record.summary, record.studyNotes, record.notes) };
    case 'transformation':
      return {
        ...named(record.name, record.aliases),
        pieces: new TextPieces().add(record.equationText, record.bondChangeSummary).rich(record.description, record.studyNotes, record.notes),
      };
    case 'mechanism': {
      const pieces = new TextPieces().rich(record.summary);
      for (const variant of record.variants) {
        pieces.add(variant.label, variant.rateLaw).rich(variant.applicability, variant.note);
        for (const step of variant.steps) pieces.add(step.title, step.stereochemicalEvent).rich(step.description, step.note);
      }
      pieces.rich(record.studyNotes, record.notes);
      return { ...named(record.name, record.aliases), pieces };
    }
    case 'caveat':
      return { title: record.title, names: distinct([record.title]), aliases: [], pieces: new TextPieces().rich(record.rule, record.statement, record.trigger, record.explanation, record.notes) };
    case 'route': {
      const pieces = new TextPieces().rich(record.description);
      for (const step of record.steps) pieces.rich(step.note);
      pieces.rich(record.notes);
      return { ...named(record.name, []), pieces };
    }
    case 'topic':
      return { ...named(record.name, record.aliases), pieces: new TextPieces().rich(record.summary, record.notes) };
    case 'reference':
      return {
        title: record.title,
        names: distinct([record.title]),
        aliases: [],
        pieces: new TextPieces().add(...record.authors, record.edition, record.publisher, record.identifier, record.year === undefined ? undefined : String(record.year)).rich(record.notes),
      };
    default:
      return undefined;
  }
}
