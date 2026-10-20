/**
 * The reaction form (step 6.3a decision D1; conditions and variants step 6.4a): Identity, Participants, Stages (with their conditions), Condition variants, Outcomes, Review, and the read-only summaries of what
 * this editor does not edit yet. Collapsible and keyboard-navigable (SectionFrame); a phone starts with the long sections closed.
 */
import { ReactionIdentitySection } from './reaction-identity';
import { ParticipantsSection } from './reaction-participants';
import { StagesSection } from './reaction-stages';
import { OutcomesSection } from './reaction-outcomes';
import { VariantsSection } from './reaction-variants';
import { ClassificationReadOnlySection, ReactionNotesReadOnlySection } from './reaction-readonly';
import type { RecordPickerPort } from './record-picker-contracts';
import { SectionFrame } from './section-frame';
import type { SectionProps } from './section-props';
import { ReviewSection } from './species-sections';
import styles from './editor.module.css';

export interface ReactionFormProps extends SectionProps {
  readonly picker?: RecordPickerPort;
  readonly newId: (prefix: string) => string;
}

export function ReactionForm(props: ReactionFormProps) {
  const open = props.phone !== true;
  const unavailable = props.unavailable === undefined ? {} : { unavailable: props.unavailable };
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...unavailable, ...(props.phone === undefined ? {} : { phone: props.phone }) };
  const picker = props.picker === undefined ? {} : { picker: props.picker };
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="identity" title="Identity">
        <ReactionIdentitySection {...common} {...picker} />
      </SectionFrame>
      <SectionFrame id="participants" title="Participants">
        <ParticipantsSection {...common} {...picker} newId={props.newId} />
      </SectionFrame>
      <SectionFrame id="stages" title="Stages">
        <StagesSection {...common} {...picker} newId={props.newId} />
      </SectionFrame>
      <SectionFrame id="variants" title="Condition variants" initiallyOpen={open}>
        <VariantsSection {...common} newId={props.newId} />
      </SectionFrame>
      <SectionFrame id="outcomes" title="Outcomes" initiallyOpen={open}>
        <OutcomesSection {...common} {...picker} newId={props.newId} />
      </SectionFrame>
      <SectionFrame id="classification" title="Mechanism and classification" initiallyOpen={false}>
        <ClassificationReadOnlySection draft={props.draft} />
      </SectionFrame>
      <SectionFrame id="review" title="Review" initiallyOpen={open}>
        <ReviewSection {...common} />
      </SectionFrame>
      <SectionFrame id="readonly" title="Notes, tags and citations" initiallyOpen={false}>
        <ReactionNotesReadOnlySection draft={props.draft} />
      </SectionFrame>
    </div>
  );
}
