/**
 * The species editor's field sections (step 6.2a part 4): Identity, Formula and charge, Stereo, Aromaticity claim, Review. Each renders
 * the draft's values and reports every change as a recipe with the field path; none decides what is valid (L1 does) and none holds
 * chemistry. A field has a label, and `data-field-path`, which the findings panel and the conflict view use.
 */
import { AROMATICITY, SPECIES_KINDS, STEREO_KINDS } from '@/core/schema';
import { Button } from '@/ui/primitives';
import type { SectionProps } from './section-props';
import {
  addDescriptor,
  AROMATICITY_WORDS,
  removeDescriptor,
  setAromaticity,
  setCharge,
  setDescriptor,
  setFormula,
  setIsotopeNote,
  setSpeciesKind,
  setStereoKind,
  setStereoNote,
  SPECIES_KIND_WORDS,
  speciesViewOf,
  STEREO_KIND_WORDS,
  stereoIsEmpty,
} from './species-model';
import styles from './editor.module.css';

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

export function IdentitySection(props: SectionProps) {
  const view = speciesViewOf(props.draft);
  const locked = props.unavailable !== undefined;
  return (
    <div>
      <div className={styles.field}>
        <label htmlFor="species-kind">Kind of species</label>
        <select id="species-kind" value={view.speciesKind} disabled={locked} aria-invalid={bad(props, 'speciesKind')} data-field-path="speciesKind" onChange={(event) => props.onEdit(setSpeciesKind(event.target.value), 'speciesKind')}>
          {SPECIES_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {SPECIES_KIND_WORDS[kind]}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="species-isotope">Isotope note (optional)</label>
        <input id="species-isotope" type="text" value={view.isotopeNote} readOnly={locked} aria-invalid={bad(props, 'isotopeNote')} data-field-path="isotopeNote" autoComplete="off" onChange={(event) => props.onEdit(setIsotopeNote(event.target.value), 'isotopeNote')} />
      </div>
    </div>
  );
}

export function FormulaChargeSection(props: SectionProps) {
  const view = speciesViewOf(props.draft);
  const locked = props.unavailable !== undefined;
  return (
    <div>
      <div className={styles.field}>
        <label htmlFor="species-formula">Formula (optional)</label>
        <input id="species-formula" type="text" value={view.formula} readOnly={locked} aria-invalid={bad(props, 'formula')} data-field-path="formula" autoComplete="off" spellCheck={false} onChange={(event) => props.onEdit(setFormula(event.target.value), 'formula')} />
      </div>
      <div className={styles.field}>
        <label htmlFor="species-charge">Charge (a whole number from -20 to 20, optional)</label>
        <input id="species-charge" type="text" inputMode="numeric" value={view.charge} readOnly={locked} aria-invalid={bad(props, 'charge')} data-field-path="charge" autoComplete="off" onChange={(event) => props.onEdit(setCharge(event.target.value), 'charge')} />
      </div>
    </div>
  );
}

export function StereoSection(props: SectionProps) {
  const view = speciesViewOf(props.draft);
  const locked = props.unavailable !== undefined;
  const stated = view.stereoKind !== '';
  const holdsMore = stated && !stereoIsEmpty({ descriptors: view.descriptors, note: view.stereoNote });
  return (
    <div>
      <div className={styles.field}>
        <label htmlFor="species-stereo-kind">Stereo statement</label>
        <select id="species-stereo-kind" value={view.stereoKind} disabled={locked} aria-invalid={bad(props, 'stereo.kind')} data-field-path="stereo.kind" onChange={(event) => props.onEdit(setStereoKind(event.target.value), 'stereo.kind')}>
          <option value="" disabled={holdsMore}>
            Not stated
          </option>
          {STEREO_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {STEREO_KIND_WORDS[kind]}
            </option>
          ))}
        </select>
        {holdsMore ? <p className={styles.hint}>To clear the statement, remove its descriptors and note first.</p> : null}
      </div>
      <div className={styles.list} role="group" aria-label="Stereo descriptors">
        <h4>Descriptors (for example 2R, E, cis)</h4>
        {view.descriptors.length === 0 ? <p className={styles.hint}>None.</p> : null}
        <ul>
          {view.descriptors.map((item, index) => (
            // the list has no identity of its own: a row is its position
            <li key={index} className={styles.row}>
              <input type="text" value={item} readOnly={locked} aria-label={`Descriptor ${index + 1}`} aria-invalid={bad(props, `stereo.descriptors[${index}]`)} data-field-path={`stereo.descriptors[${index}]`} autoComplete="off" spellCheck={false} onChange={(event) => props.onEdit(setDescriptor(index, event.target.value), `stereo.descriptors[${index}]`)} />
              <Button aria-label={`Remove descriptor ${index + 1}`} {...(locked ? { unavailable: props.unavailable as string } : { onClick: () => props.onEdit(removeDescriptor(index)) })}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <Button {...(locked ? { unavailable: props.unavailable as string } : { onClick: () => props.onEdit(addDescriptor()) })}>Add descriptor</Button>
      </div>
      {stated ? (
        <div className={styles.field}>
          <label htmlFor="species-stereo-note">Stereo note (optional)</label>
          <textarea id="species-stereo-note" rows={2} value={view.stereoNote} readOnly={locked} aria-invalid={bad(props, 'stereo.note')} data-field-path="stereo.note" onChange={(event) => props.onEdit(setStereoNote(event.target.value), 'stereo.note')} />
        </div>
      ) : null}
    </div>
  );
}

export function AromaticitySection(props: SectionProps) {
  const view = speciesViewOf(props.draft);
  return (
    <div className={styles.field}>
      <label htmlFor="species-aromaticity">Aromatic, antiaromatic or neither?</label>
      <select id="species-aromaticity" value={view.aromaticity} disabled={props.unavailable !== undefined} aria-invalid={bad(props, 'aromaticity')} data-field-path="aromaticity" onChange={(event) => props.onEdit(setAromaticity(event.target.value), 'aromaticity')}>
        <option value="">Not stated</option>
        {AROMATICITY.map((kind) => (
          <option key={kind} value={kind}>
            {AROMATICITY_WORDS[kind]}
          </option>
        ))}
      </select>
      <p className={styles.hint}>This is your claim. The structure panel shows what the structure itself says.</p>
    </div>
  );
}

export { ReviewSection } from './review-section';
