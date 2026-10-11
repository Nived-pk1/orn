/**
 * The levels each record kind shows between L1 (the header) and L5 (provenance) (steps 5.6a and 5.6b). EVERY kind of the schema has a
 * readable view (`READABLE_KINDS`: the completeness test checks all 22); the raw record at L5 still carries every field, so nothing is
 * hidden. The view of a kind is wrapped in an element that says which kind it is (`data-view`).
 */
import type { AnyRecord, ChemicalClass, Reaction, Reagent, RecordKind, Species } from '@/core/schema';
import type { Finding } from '@/core/validation';
import { ReactionLevels } from './view-reaction';
import { LazyOtherView } from './lazy-views';
import { ClassLevels, ReagentLevels, SpeciesLevels } from './view-substance';

/** Every record kind that has its own readable view. */
export const READABLE_KINDS: readonly RecordKind[] = [
  'species', 'class', 'reagent', 'reaction', 'transformation', 'named_reaction', 'concept', 'caveat', 'route', 'reference', 'mechanism', 'relationship',
  'exam', 'exam_version', 'topic', 'topic_mapping', 'exam_relevance', 'asset', 'navigator_anchor', 'reaction_scheme', 'view_preset', 'entity_display',
];

function View(props: { readonly record: AnyRecord; readonly findings: readonly Finding[] }) {
  const { record, findings } = props;
  switch (record.kind) {
    case 'species':
      return <SpeciesLevels record={record as Species} findings={findings} />;
    case 'class':
      return <ClassLevels record={record as ChemicalClass} findings={findings} />;
    case 'reagent':
      return <ReagentLevels record={record as Reagent} findings={findings} />;
    case 'reaction':
      return <ReactionLevels record={record as Reaction} findings={findings} />;
    default:
      return <LazyOtherView record={record} />;
  }
}

export function KindLevels(props: { readonly record: AnyRecord; readonly findings: readonly Finding[] }) {
  return (
    <div data-view={props.record.kind}>
      <View record={props.record} findings={props.findings} />
    </div>
  );
}
