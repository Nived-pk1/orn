/**
 * The transformation form (step 6.6b part 2, decision N3): Identity (name, aliases), the classes it goes from and to (the class picker),
 * what changes (equation text, bond change summary, carbon chain change: "Not stated" and the schema's seven values), the reaction SMARTS
 * read-only and kept unchanged (a future seam), Used by (derived, read-only), the texts (Description, Study notes, Notes), Concepts, Tags,
 * Citations and Review.
 */
import type { RecordRef } from '@/core/schema';
import { CarbonChainField, KeptTextSection, LinkedRecordsSection, NameAliasesSection, ShortTextField, UsedBySection, type PickerSectionProps } from './knowledge-sections';
import { knowledgeViewOf } from './knowledge-model';
import { PicturesFrame } from './pictures-frame';
import { SectionFrame } from './section-frame';
import { SharedFieldsSection } from './shared-bundle';
import { ReviewSection } from './species-sections';
import styles from './editor.module.css';

export interface TransformationFormProps extends PickerSectionProps {
  readonly openRecord?: ((ref: RecordRef) => void) | undefined;
}

export function TransformationForm(props: TransformationFormProps) {
  const open = props.phone !== true;
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...(props.unavailable === undefined ? {} : { unavailable: props.unavailable }), ...(props.phone === undefined ? {} : { phone: props.phone }) };
  const view = knowledgeViewOf(props.draft);
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="identity" title="Identity">
        <NameAliasesSection {...common} idPrefix="transformation" />
      </SectionFrame>
      <SectionFrame id="classes" title="From and to classes">
        <LinkedRecordsSection {...common} picker={props.picker} field="fromClassIds" kind="class" label="From classes" findLabel="Find a from class by name" noun="class" resultsLabel="Classes found" ids={view.fromClassIds} />
        <LinkedRecordsSection {...common} picker={props.picker} field="toClassIds" kind="class" label="To classes" findLabel="Find a to class by name" noun="class" resultsLabel="Classes found" ids={view.toClassIds} />
      </SectionFrame>
      <SectionFrame id="change" title="What changes" initiallyOpen={open}>
        <ShortTextField {...common} field="equationText" label="Equation text" hint="Plain text, for example R-CH2OH -> R-CHO. It is never parsed." />
        <ShortTextField {...common} field="bondChangeSummary" label="Bond change summary" />
        <CarbonChainField {...common} />
        <KeptTextSection label="Reaction SMARTS" value={view.reactionSmarts} />
      </SectionFrame>
      <SectionFrame id="used-by" title="Used by" initiallyOpen={open}>
        <UsedBySection kind="transformation" id={view.id} picker={props.picker} openRecord={props.openRecord} />
      </SectionFrame>
      <SectionFrame id="shared" title="Texts, concepts, tags and citations" initiallyOpen={open}>
        <SharedFieldsSection {...common} notes={['description', 'studyNotes', 'notes']} concepts picker={props.picker} />
      </SectionFrame>
      <PicturesFrame kind="transformation" form={props} />
      <SectionFrame id="review" title="Review" initiallyOpen={open}>
        <ReviewSection {...common} />
      </SectionFrame>
    </div>
  );
}
