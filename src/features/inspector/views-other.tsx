/**
 * The readable views of every kind except reaction, species, class and reagent (step 5.7, lazy loading). This module is its own chunk:
 * `views.tsx` loads it with a dynamic `import()` when such a record is first opened (`lazy-views.tsx`).
 */
import type { Finding } from '@/core/validation';
import type { AnyRecord, Asset, RecordRef, ChemicalClass, Reaction, Reagent, Species, Caveat, Concept, EntityDisplay, Exam, ExamRelevance, ExamVersion, Mechanism, NamedReaction, NavigatorAnchor, ReactionScheme, Reference, Relationship, Route, Topic, TopicMapping, Transformation, ViewPreset } from '@/core/schema';
import { ReactionLevels } from './view-reaction';
import { ClassLevels, ReagentLevels, SpeciesLevels } from './view-substance';
import { ExamLevels, ExamRelevanceLevels, ExamVersionLevels, TopicMappingLevels } from './view-curriculum';
import { AssetLevels } from './view-asset';
import { CaveatLevels, ConceptLevels, NamedReactionLevels, TransformationLevels } from './view-knowledge';
import { MechanismLevels } from './view-mechanism';
import { ReferenceLevels, RelationshipLevels, RouteLevels, TopicLevels } from './view-organisation';
import { EntityDisplayLevels, NavigatorAnchorLevels, ReactionSchemeLevels, ViewPresetLevels } from './view-presentation';
import { RecordPictures } from './view-pictures';

/** The levels of a kind, with the record's own pictures FIRST when its kind takes them (step 7.1a, ADR-038 addendum Q5): the one place they are drawn. */
export function OtherView(props: { readonly record: AnyRecord; readonly findings: readonly Finding[] }) {
  return (
    <>
      <RecordPictures target={{ kind: props.record.kind, id: props.record.id } as RecordRef} />
      <LevelsOf record={props.record} findings={props.findings} />
    </>
  );
}

function LevelsOf(props: { readonly record: AnyRecord; readonly findings: readonly Finding[] }) {
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
    default:
      return null;
  }
}
