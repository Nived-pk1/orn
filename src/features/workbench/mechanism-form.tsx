/**
 * The mechanism form (step 6.5a decisions D2, D4 and D7): Identity, Summary, Variants (each open variant holds its Steps), Review and the
 * read-only fields this editor does not name. Collapsible and keyboard-navigable (SectionFrame); a phone starts with the long sections closed.
 */
import type { MechanismLinksPort } from './mechanism-contracts';
import { MechanismIdentitySection, MechanismSummarySection } from './mechanism-identity';
import { MechanismPicturesSection } from './mechanism-pictures';
import { MechanismReadOnlySection } from './mechanism-readonly';
import { StepsSection } from './mechanism-steps';
import { MechanismVariantsSection } from './mechanism-variants';
import type { PicturesPort } from './picture-contracts';
import type { RecordPickerPort } from './record-picker-contracts';
import { SectionFrame } from './section-frame';
import type { SectionProps } from './section-props';
import { ReviewSection } from './species-sections';
import type { StructurePort } from './structure-contracts';
import styles from './editor.module.css';

export interface MechanismFormProps extends SectionProps {
  readonly newId: (prefix: string) => string;
  readonly links?: MechanismLinksPort | undefined;
  /** The pictures port (step 6.5b); absent: the editor has no Pictures section. */
  readonly pictures?: PicturesPort | undefined;
  /** Whether the mechanism is saved (a picture is attached to a record that must exist). */
  readonly saved?: boolean | undefined;
  readonly picker?: RecordPickerPort | undefined;
  readonly structure?: StructurePort | undefined;
  readonly timers: { after(ms: number, run: () => void): () => void };
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
      {props.pictures === undefined ? null : (
        <SectionFrame id="pictures" title="Pictures">
          <MechanismPicturesSection mechanismId={String((props.draft as { id?: unknown }).id ?? '')} port={props.pictures} saved={props.saved === true} unavailable={props.unavailable} phone={props.phone} />
        </SectionFrame>
      )}
      <SectionFrame id="variants" title="Variants" initiallyOpen={open}>
        <MechanismVariantsSection
          {...common}
          newId={props.newId}
          links={props.links}
          renderSteps={(v) => <StepsSection {...common} v={v} newId={props.newId} links={props.links} picker={props.picker} structure={props.structure} timers={props.timers} />}
        />
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
