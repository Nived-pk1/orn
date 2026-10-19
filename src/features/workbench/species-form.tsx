/**
 * The species form (step 6.2a part 4, decision D2): the sections in one place. Names (the shared NamesSection), Identity, Structure
 * (the structure panel), Formula and charge, Stereo, Aromaticity claim, Classes (with suggestions), Review, and the read-only record
 * of properties and notes. Collapsible and keyboard-navigable (SectionFrame); a phone starts with the long sections closed.
 */
import type { ClassSuggestion } from './check-contracts';
import type { ClassPickerPort } from './class-picker-contracts';
import { ClassesSection } from './classes-section';
import { NamesSection } from './names-section';
import { SectionFrame } from './section-frame';
import type { SectionProps } from './section-props';
import { AromaticitySection, FormulaChargeSection, IdentitySection, ReviewSection, StereoSection } from './species-sections';
import { ReadOnlySection } from './species-readonly';
import { StructurePanel } from './structure-panel';
import type { StructurePort } from './structure-contracts';
import styles from './editor.module.css';

export interface SpeciesFormProps extends SectionProps {
  readonly structure: StructurePort | undefined;
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly picker?: ClassPickerPort;
  readonly suggestions: readonly ClassSuggestion[];
}

export function SpeciesForm(props: SpeciesFormProps) {
  const open = props.phone !== true;
  const unavailable = props.unavailable === undefined ? {} : { unavailable: props.unavailable };
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...unavailable, ...(props.phone === undefined ? {} : { phone: props.phone }) };
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="names" title="Names">
        <NamesSection {...common} framed />
      </SectionFrame>
      <SectionFrame id="identity" title="Identity">
        <IdentitySection {...common} />
      </SectionFrame>
      <SectionFrame id="structure" title="Structure">
        {props.structure === undefined ? (
          <p className={styles.hint}>The chemistry engine is not available here, so the structure is not read.</p>
        ) : (
          <StructurePanel draft={props.draft} onEdit={props.onEdit} port={props.structure} timers={props.timers} {...(props.phone === true ? { phone: true } : {})} {...(props.invalid === undefined ? {} : { invalid: props.invalid })} {...unavailable} />
        )}
      </SectionFrame>
      <SectionFrame id="formula" title="Formula and charge" initiallyOpen={open}>
        <FormulaChargeSection {...common} />
      </SectionFrame>
      <SectionFrame id="stereo" title="Stereo" initiallyOpen={open}>
        <StereoSection {...common} />
      </SectionFrame>
      <SectionFrame id="aromaticity" title="Aromaticity claim" initiallyOpen={open}>
        <AromaticitySection {...common} />
      </SectionFrame>
      <SectionFrame id="classes" title="Classes">
        <ClassesSection {...common} suggestions={props.suggestions} {...(props.picker === undefined ? {} : { picker: props.picker })} />
      </SectionFrame>
      <SectionFrame id="review" title="Review" initiallyOpen={open}>
        <ReviewSection {...common} />
      </SectionFrame>
      <SectionFrame id="readonly" title="Properties, notes and citations" initiallyOpen={open}>
        <ReadOnlySection draft={props.draft} />
      </SectionFrame>
    </div>
  );
}
