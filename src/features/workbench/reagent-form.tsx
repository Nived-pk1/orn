/**
 * The reagent form (step 6.2b decision D3): Names (the shared NamesSection), Identity, Families, Classes, Profiles, Review, and the
 * read-only record of what this editor does not edit. Collapsible and keyboard-navigable (SectionFrame); a phone starts with the long
 * sections closed.
 */
import { NamesSection } from './names-section';
import { ProfilesSection } from './reagent-profiles';
import { FamiliesSection, ReagentClassesSection, ReagentIdentitySection } from './reagent-sections';
import { SharedFieldsSection } from './shared-bundle';
import type { RecordPickerPort } from './record-picker-contracts';
import { SectionFrame } from './section-frame';
import type { SectionProps } from './section-props';
import { ReviewSection } from './species-sections';
import styles from './editor.module.css';

export interface ReagentFormProps extends SectionProps {
  readonly picker?: RecordPickerPort;
  readonly newId: (prefix: string) => string;
}

export function ReagentForm(props: ReagentFormProps) {
  const open = props.phone !== true;
  const unavailable = props.unavailable === undefined ? {} : { unavailable: props.unavailable };
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...unavailable, ...(props.phone === undefined ? {} : { phone: props.phone }) };
  const picker = props.picker === undefined ? {} : { picker: props.picker };
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="names" title="Names">
        <NamesSection {...common} framed />
      </SectionFrame>
      <SectionFrame id="identity" title="Identity">
        <ReagentIdentitySection {...common} {...picker} />
      </SectionFrame>
      <SectionFrame id="families" title="Families" initiallyOpen={open}>
        <FamiliesSection {...common} />
      </SectionFrame>
      <SectionFrame id="classes" title="Classes" initiallyOpen={open}>
        <ReagentClassesSection {...common} {...picker} />
      </SectionFrame>
      <SectionFrame id="profiles" title="Profiles">
        <ProfilesSection {...common} newId={props.newId} />
      </SectionFrame>
      <SectionFrame id="review" title="Review" initiallyOpen={open}>
        <ReviewSection {...common} />
      </SectionFrame>
      <SectionFrame id="shared" title="Notes, tags and citations" initiallyOpen={open}>
        <SharedFieldsSection {...common} notes={['description', 'studyNotes', 'notes']} {...picker} />
      </SectionFrame>
    </div>
  );
}
