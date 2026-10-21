/**
 * The named reaction form (step 6.6b part 2, decision N2): Identity (name, aliases, difficulty), Parents (cycle refused in words), Concepts
 * and Prerequisite concepts through the picker, Used by (the reactions that name it: derived and read-only), the texts (Summary, Typical
 * conditions, Study notes, Notes), Tags, Citations and Review. A named reaction has no link to a transformation: that lives on the reaction.
 */
import type { RecordRef } from '@/core/schema';
import { DifficultyField, KnowledgeParentsSection, NameAliasesSection, UsedBySection, type PickerSectionProps } from './knowledge-sections';
import { knowledgeViewOf } from './knowledge-model';
import { SectionFrame } from './section-frame';
import { SharedFieldsSection } from './shared-bundle';
import { ConceptsSection } from './shared-sections';
import { ReviewSection } from './species-sections';
import styles from './editor.module.css';

export interface NamedReactionFormProps extends PickerSectionProps {
  readonly openRecord?: ((ref: RecordRef) => void) | undefined;
}

export function NamedReactionForm(props: NamedReactionFormProps) {
  const open = props.phone !== true;
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...(props.unavailable === undefined ? {} : { unavailable: props.unavailable }), ...(props.phone === undefined ? {} : { phone: props.phone }) };
  const view = knowledgeViewOf(props.draft);
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="identity" title="Identity">
        <NameAliasesSection {...common} idPrefix="named-reaction" />
        <DifficultyField {...common} />
      </SectionFrame>
      <SectionFrame id="parents" title="Parents">
        <KnowledgeParentsSection {...common} kind="named_reaction" picker={props.picker} />
      </SectionFrame>
      <SectionFrame id="prerequisites" title="Prerequisite concepts" initiallyOpen={open}>
        <ConceptsSection {...common} picker={props.picker} field="prerequisiteConceptIds" label="Prerequisite concepts" findLabel="Find a prerequisite concept by name" />
      </SectionFrame>
      <SectionFrame id="used-by" title="Used by" initiallyOpen={open}>
        <UsedBySection kind="named_reaction" id={view.id} picker={props.picker} openRecord={props.openRecord} />
      </SectionFrame>
      <SectionFrame id="shared" title="Texts, concepts, tags and citations" initiallyOpen={open}>
        <SharedFieldsSection {...common} notes={['summary', 'typicalConditions', 'studyNotes', 'notes']} concepts picker={props.picker} />
      </SectionFrame>
      <SectionFrame id="review" title="Review" initiallyOpen={open}>
        <ReviewSection {...common} />
      </SectionFrame>
    </div>
  );
}
