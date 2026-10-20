/**
 * The mechanism form (step 6.5a decisions D2 and D7): Identity, Summary, Variants, Review and the read-only fields this editor does not
 * name. Collapsible and keyboard-navigable (SectionFrame); a phone starts with the long sections closed.
 */
import type { MechanismLinksPort } from './mechanism-contracts';
import { MechanismIdentitySection, MechanismSummarySection } from './mechanism-identity';
import { MechanismReadOnlySection } from './mechanism-readonly';
import { MechanismVariantsSection } from './mechanism-variants';
import { SectionFrame } from './section-frame';
import type { SectionProps } from './section-props';
import { ReviewSection } from './species-sections';
import styles from './editor.module.css';

export interface MechanismFormProps extends SectionProps {
  readonly newId: (prefix: string) => string;
  readonly links?: MechanismLinksPort | undefined;
}

export function MechanismForm(props: MechanismFormProps) {
  const open = props.phone !== true;
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...(props.unavailable === undefined ? {} : { unavailable: props.unavailable }), ...(props.phone === undefined ? {} : { phone: props.phone }) };
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="identity" title="Identity">
        <MechanismIdentitySection {...common} />
      </SectionFrame>
      <SectionFrame id="summary" title="Summary">
        <MechanismSummarySection {...common} links={props.links} />
      </SectionFrame>
      <SectionFrame id="variants" title="Variants" initiallyOpen={open}>
        <MechanismVariantsSection {...common} newId={props.newId} links={props.links} />
      </SectionFrame>
      <SectionFrame id="review" title="Review" initiallyOpen={open}>
        <ReviewSection {...common} />
      </SectionFrame>
      <SectionFrame id="readonly" title="Classes, notes, tags and citations" initiallyOpen={false}>
        <MechanismReadOnlySection draft={props.draft} />
      </SectionFrame>
    </div>
  );
}
