/**
 * The levels each record kind shows between L1 (the header) and L5 (provenance) (steps 5.6a and 5.6b). EVERY kind of the schema has a
 * readable view (`READABLE_KINDS`: the completeness test checks all 22); the raw record at L5 still carries every field, so nothing is
 * hidden. The view of a kind is wrapped in an element that says which kind it is (`data-view`).
 */
import type { AnyRecord, Asset, Caveat, ChemicalClass, Concept, EntityDisplay, Exam, ExamRelevance, ExamVersion, Mechanism, NamedReaction, NavigatorAnchor, Reaction, ReactionScheme, Reagent, RecordKind, Reference, Relationship, Route, Species, Topic, TopicMapping, Transformation, ViewPreset } from '@/core/schema';
import type { Finding } from '@/core/validation';
import { ExamLevels, ExamRelevanceLevels, ExamVersionLevels, TopicMappingLevels } from './view-curriculum';
import { AssetLevels } from './view-asset';
import { CaveatLevels, ConceptLevels, NamedReactionLevels, TransformationLevels } from './view-knowledge';
import { MechanismLevels } from './view-mechanism';
import { ReferenceLevels, RelationshipLevels, RouteLevels, TopicLevels } from './view-organisation';
import { EntityDisplayLevels, NavigatorAnchorLevels, ReactionSchemeLevels, ViewPresetLevels } from './view-presentation';
import { ReactionLevels } from './view-reaction';
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
    case 'named_reaction':
      return <NamedReactionLevels record={record as NamedReaction} />;
    case 'concept':
      return <ConceptLevels record={record as Concept} />;
    case 'transformation':
      return <TransformationLevels record={record as Transformation} />;
    case 'caveat':
      return <CaveatLevels record={record as Caveat} />;
    case 'mechanism':
      return <MechanismLevels record={record as Mechanism} />;
    case 'route':
      return <RouteLevels record={record as Route} />;
    case 'topic':
      return <TopicLevels record={record as Topic} />;
    case 'relationship':
      return <RelationshipLevels record={record as Relationship} />;
    case 'reference':
      return <ReferenceLevels record={record as Reference} />;
    case 'exam':
      return <ExamLevels record={record as Exam} />;
    case 'exam_version':
      return <ExamVersionLevels record={record as ExamVersion} />;
    case 'topic_mapping':
      return <TopicMappingLevels record={record as TopicMapping} />;
    case 'exam_relevance':
      return <ExamRelevanceLevels record={record as ExamRelevance} />;
    case 'asset':
      return <AssetLevels record={record as Asset} />;
    case 'navigator_anchor':
      return <NavigatorAnchorLevels record={record as NavigatorAnchor} />;
    case 'reaction_scheme':
      return <ReactionSchemeLevels record={record as ReactionScheme} />;
    case 'view_preset':
      return <ViewPresetLevels record={record as ViewPreset} />;
    case 'entity_display':
      return <EntityDisplayLevels record={record as EntityDisplay} />;
  }
}

export function KindLevels(props: { readonly record: AnyRecord; readonly findings: readonly Finding[] }) {
  return (
    <div data-view={props.record.kind}>
      <View record={props.record} findings={props.findings} />
    </div>
  );
}
