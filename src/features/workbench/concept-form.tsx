/**
 * The concept form (step 6.6b part 2, decision N1): Identity (name, aliases, kind of concept with no default, difficulty), Parents (the
 * cycle question is asked before Save), the shared texts (Summary, Study notes, Notes), Tags and Citations, and Review. Collapsible and
 * keyboard-navigable (SectionFrame); a phone starts with the long sections closed. The schema has no concept links and no prerequisites.
 */
import { ConceptKindField, DifficultyField, KnowledgeParentsSection, NameAliasesSection, type PickerSectionProps } from './knowledge-sections';
import { PicturesFrame } from './pictures-frame';
import { SectionFrame } from './section-frame';
import { SharedFieldsSection } from './shared-bundle';
import { ReviewSection } from './species-sections';
import styles from './editor.module.css';

export function ConceptForm(props: PickerSectionProps) {
  const open = props.phone !== true;
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...(props.unavailable === undefined ? {} : { unavailable: props.unavailable }), ...(props.phone === undefined ? {} : { phone: props.phone }) };
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="identity" title="Identity">
        <NameAliasesSection {...common} idPrefix="concept" />
        <ConceptKindField {...common} />
        <DifficultyField {...common} />
      </SectionFrame>
      <SectionFrame id="parents" title="Parents">
        <KnowledgeParentsSection {...common} kind="concept" picker={props.picker} />
      </SectionFrame>
      <SectionFrame id="shared" title="Summary, notes, tags and citations" initiallyOpen={open}>
        <SharedFieldsSection {...common} notes={['summary', 'studyNotes', 'notes']} picker={props.picker} />
      </SectionFrame>
      <PicturesFrame kind="concept" form={props} />
      <SectionFrame id="review" title="Review" initiallyOpen={open}>
        <ReviewSection {...common} />
      </SectionFrame>
    </div>
  );
}
