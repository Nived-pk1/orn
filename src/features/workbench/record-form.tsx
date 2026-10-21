/**
 * The form of the record being edited: the species form, the class form, the reagent form, or (a kind without a full form) the Names section alone. One
 * place chooses, so the host knows no kind (step 6.2b).
 */
import type { RecordKind, RecordRef } from '@/core/schema';
import type { ClassSuggestion } from './check-contracts';
import { CaveatForm } from './caveat-form';
import { CURRICULUM_TARGET_KINDS } from './curriculum-model';
import { ExamRelevanceSection, SyllabusTopicsSection } from './curriculum-lists';
import { RelevanceForm } from './relevance-form';
import { FamilyForm } from './family-form';
import { ExamForm } from './exam-form';
import { ExamVersionForm } from './exam-version-form';
import { MappingForm } from './mapping-form';
import { TopicForm } from './topic-form';
import { ClassForm } from './class-form';
import { ConceptForm } from './concept-form';
import { NamedReactionForm } from './named-reaction-form';
import { NamesSection } from './names-section';
import { TransformationForm } from './transformation-form';
import { MechanismForm } from './mechanism-form';
import type { MechanismLinksPort } from './mechanism-contracts';
import { ReactionForm } from './reaction-form';
import { RelationshipForm } from './relationship-form';
import { RelationshipsList } from './relationships-list';
import { SectionFrame } from './section-frame';
import { ReagentForm } from './reagent-form';
import type { PicturesPort } from './picture-contracts';
import type { RecordPickerPort } from './record-picker-contracts';
import type { SectionProps } from './section-props';
import { SourceForm } from './source-form';
import { SpeciesForm } from './species-form';
import styles from './editor.module.css';
import type { StructurePort } from './structure-contracts';

export interface RecordFormProps extends SectionProps {
  readonly kind: RecordKind;
  readonly structure: StructurePort | undefined;
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly picker?: RecordPickerPort;
  readonly newId: (prefix: string) => string;
  readonly suggestions: readonly ClassSuggestion[];
  readonly links?: MechanismLinksPort | undefined;
  readonly pictures?: PicturesPort | undefined;
  readonly saved?: boolean | undefined;
  /** Closes the editor (the draft is kept) and shows the record in the inspector: "Used by" and "Relationships" lists. */
  readonly openRecord?: ((ref: RecordRef) => void) | undefined;
  /** Closes the editor (the draft is kept) and opens a NEW editor of this kind with these fields filled in (step 6.6c). */
  readonly startNew?: ((kind: RecordKind, seed: Readonly<Record<string, unknown>>) => void) | undefined;
  /** Closes the editor (the draft is kept) and opens the editor of an existing record (step 6.6c). */
  readonly editRecord?: ((ref: RecordRef) => void) | undefined;
}

function KindForm(props: RecordFormProps) {
  const { kind, suggestions, newId, links, pictures, saved, openRecord, startNew, editRecord, ...rest } = props;
  if (kind === 'topic') return <TopicForm {...rest} saved={saved} openRecord={openRecord} startNew={startNew} />;
  if (kind === 'exam') return <ExamForm {...rest} saved={saved} startNew={startNew} editRecord={editRecord} />;
  if (kind === 'exam_version') return <ExamVersionForm {...rest} newId={newId} saved={saved} />;
  if (kind === 'topic_mapping') return <MappingForm {...rest} />;
  if (kind === 'exam_relevance') return <RelevanceForm {...rest} />;
  if (kind === 'navigator_anchor') return <FamilyForm {...rest} />;
  if (kind === 'relationship') return <RelationshipForm {...rest} />;
  if (kind === 'caveat') return <CaveatForm {...rest} />;
  if (kind === 'concept') return <ConceptForm {...rest} />;
  if (kind === 'named_reaction') return <NamedReactionForm {...rest} openRecord={openRecord} />;
  if (kind === 'transformation') return <TransformationForm {...rest} openRecord={openRecord} />;
  if (kind === 'species') return <SpeciesForm {...rest} suggestions={suggestions} />;
  if (kind === 'class') return <ClassForm {...rest} saved={saved} startNew={startNew} editRecord={editRecord} />;
  if (kind === 'reference') return <SourceForm draft={rest.draft} onEdit={rest.onEdit} picker={rest.picker} {...(rest.invalid === undefined ? {} : { invalid: rest.invalid })} {...(rest.unavailable === undefined ? {} : { unavailable: rest.unavailable })} {...(rest.phone === undefined ? {} : { phone: rest.phone })} />;
  if (kind === 'reaction') return <ReactionForm draft={rest.draft} onEdit={rest.onEdit} newId={newId} links={links} {...(rest.invalid === undefined ? {} : { invalid: rest.invalid })} {...(rest.unavailable === undefined ? {} : { unavailable: rest.unavailable })} {...(rest.phone === undefined ? {} : { phone: rest.phone })} {...(rest.picker === undefined ? {} : { picker: rest.picker })} />;
  if (kind === 'mechanism') return <MechanismForm draft={rest.draft} onEdit={rest.onEdit} newId={newId} links={links} pictures={pictures} saved={saved} picker={rest.picker} structure={rest.structure} timers={rest.timers} {...(rest.invalid === undefined ? {} : { invalid: rest.invalid })} {...(rest.unavailable === undefined ? {} : { unavailable: rest.unavailable })} {...(rest.phone === undefined ? {} : { phone: rest.phone })} />;
  if (kind === 'reagent') return <ReagentForm draft={rest.draft} onEdit={rest.onEdit} newId={newId} {...(rest.invalid === undefined ? {} : { invalid: rest.invalid })} {...(rest.unavailable === undefined ? {} : { unavailable: rest.unavailable })} {...(rest.phone === undefined ? {} : { phone: rest.phone })} {...(rest.picker === undefined ? {} : { picker: rest.picker })} />;
  const { draft, onEdit, invalid, unavailable, phone } = props;
  return <NamesSection draft={draft} onEdit={onEdit} phone={phone} {...(invalid === undefined ? {} : { invalid })} {...(unavailable === undefined ? {} : { unavailable })} />;
}

/** Kinds that can be an end of a relationship: their editor ends with the read-only "Relationships" list (step 6.6b part 4). */
const NO_RELATIONSHIPS: readonly RecordKind[] = ['relationship', 'reference', 'topic', 'topic_mapping', 'exam_relevance', 'navigator_anchor', 'exam', 'exam_version'];

export function RecordForm(props: RecordFormProps) {
  const id = (props.draft as { id?: unknown } | null)?.id;
  const listed = !NO_RELATIONSHIPS.includes(props.kind);
  return (
    <div className={styles.formColumn} data-editor-form="">
      <KindForm {...props} />
      {!CURRICULUM_TARGET_KINDS.includes(props.kind) ? null : (
        <>
          <SyllabusTopicsSection kind={props.kind} id={typeof id === 'string' ? id : ''} saved={props.saved === true} picker={props.picker} openRecord={props.openRecord} startNew={props.startNew} />
          <ExamRelevanceSection kind={props.kind} id={typeof id === 'string' ? id : ''} saved={props.saved === true} picker={props.picker} openRecord={props.openRecord} startNew={props.startNew} />
        </>
      )}
      {!listed ? null : (
        <SectionFrame id="relationships" title="Relationships" initiallyOpen={false}>
          <RelationshipsList kind={props.kind} id={typeof id === 'string' ? id : ''} picker={props.picker} openRecord={props.openRecord} saved={props.saved === true} startNew={props.startNew} />
        </SectionFrame>
      )}
    </div>
  );
}
