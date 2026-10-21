/**
 * The class form (step 6.2b decision D1): Names (the shared NamesSection), Identity, Parents, Generic representation, Examples, Review, and
 * the read-only record of what this editor does not edit. Collapsible and keyboard-navigable (SectionFrame); a phone starts with the long
 * sections closed.
 */
import { GenericSection } from './class-generic';
import { ClassIdentitySection, ExamplesSection, ParentsSection } from './class-sections';
import { NamesSection } from './names-section';
import type { RecordPickerPort } from './record-picker-contracts';
import { SectionFrame } from './section-frame';
import type { SectionProps } from './section-props';
import { SharedFieldsSection } from './shared-bundle';
import { ReviewSection } from './species-sections';
import type { StructurePort } from './structure-contracts';
import styles from './editor.module.css';

export interface ClassFormProps extends SectionProps {
  readonly structure: StructurePort | undefined;
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly picker?: RecordPickerPort;
}

export function ClassForm(props: ClassFormProps) {
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
        <ClassIdentitySection {...common} {...picker} />
      </SectionFrame>
      <SectionFrame id="parents" title="Parents">
        <ParentsSection {...common} {...picker} />
      </SectionFrame>
      <SectionFrame id="generic" title="Generic representation" initiallyOpen={open}>
        <GenericSection {...common} structure={props.structure} timers={props.timers} />
      </SectionFrame>
      <SectionFrame id="examples" title="Examples" initiallyOpen={open}>
        <ExamplesSection {...common} {...picker} />
      </SectionFrame>
      <SectionFrame id="review" title="Review" initiallyOpen={open}>
        <ReviewSection {...common} />
      </SectionFrame>
      <SectionFrame id="shared" title="Notes, tags and citations" initiallyOpen={open}>
        <SharedFieldsSection {...common} notes={['description', 'studyNotes', 'notes', 'generic.rGroupNote']} {...picker} />
      </SectionFrame>
    </div>
  );
}
