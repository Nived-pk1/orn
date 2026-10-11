/**
 * The readable views of every kind except reaction, species, class and reagent (step 5.7, lazy loading). This module is its own chunk:
 * `views.tsx` loads it with a dynamic `import()` when such a record is first opened (`lazy-views.tsx`).
 */
import type { AnyRecord, Asset, Caveat, Concept, EntityDisplay, Exam, ExamRelevance, ExamVersion, Mechanism, NamedReaction, NavigatorAnchor, ReactionScheme, Reference, Relationship, Route, Topic, TopicMapping, Transformation, ViewPreset } from '@/core/schema';
import { ExamLevels, ExamRelevanceLevels, ExamVersionLevels, TopicMappingLevels } from './view-curriculum';
import { AssetLevels } from './view-asset';
import { CaveatLevels, ConceptLevels, NamedReactionLevels, TransformationLevels } from './view-knowledge';
import { MechanismLevels } from './view-mechanism';
import { ReferenceLevels, RelationshipLevels, RouteLevels, TopicLevels } from './view-organisation';
import { EntityDisplayLevels, NavigatorAnchorLevels, ReactionSchemeLevels, ViewPresetLevels } from './view-presentation';

export function OtherView(props: { readonly record: AnyRecord }) {
  const { record } = props;
  switch (record.kind) {
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
