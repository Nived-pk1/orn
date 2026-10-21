/**
 * The reaction editor's "Links and reversibility" section (step 6.6b part 3, decision N4): reversibility (the schema's four values; its
 * `unknown` is worded "Not stated" and a new reaction starts there) with an optional note, the named reactions and transformations the
 * reaction is an instance of (pickers), prerequisite concepts, difficulty, the generalised equation as one-line text (never parsed) and the
 * atom-mapped reaction shown read-only and kept unchanged (a future seam). Recipes only; L1 and the store's gate decide what is valid.
 */
import { REVERSIBILITY } from '@/core/schema';
import { DifficultyField, KeptTextSection, LinkedRecordsSection, ShortTextField, type PickerSectionProps } from './knowledge-sections';
import { knowledgeViewOf, REVERSIBILITY_WORDS, setReversibility, setReversibilityNote } from './knowledge-model';
import { RichTextField } from './rich-text-field';
import { ConceptsSection } from './shared-sections';
import styles from './editor.module.css';

export function ReactionLinksSection(props: PickerSectionProps) {
  const view = knowledgeViewOf(props.draft);
  const { onEdit, picker } = props;
  const common = { draft: props.draft, onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...(props.unavailable === undefined ? {} : { unavailable: props.unavailable }), ...(props.phone === undefined ? {} : { phone: props.phone }) };
  return (
    <div>
      <div className={styles.field}>
        <label htmlFor="reaction-reversibility">Reversibility</label>
        <select id="reaction-reversibility" value={view.reversibility} disabled={props.unavailable !== undefined} aria-invalid={props.invalid?.has('reversibility.kind') === true ? true : undefined} data-field-path="reversibility.kind" onChange={(event) => onEdit(setReversibility(event.target.value), 'reversibility.kind')}>
          {(['unknown', ...REVERSIBILITY.filter((kind) => kind !== 'unknown')] as const).map((kind) => (
            <option key={kind} value={kind}>
              {REVERSIBILITY_WORDS[kind]}
            </option>
          ))}
        </select>
      </div>
      <RichTextField id="reaction-reversibility-note" label="Reversibility note" path="reversibility.note" value={view.reversibilityNote} invalid={props.invalid?.has('reversibility.note') === true} unavailable={props.unavailable} phone={props.phone} rows={3} onChange={(value) => onEdit(setReversibilityNote(value), 'reversibility.note')} />
      <LinkedRecordsSection {...common} picker={picker} field="namedReactionIds" kind="named_reaction" label="Named reactions" findLabel="Find a named reaction by name" noun="named reaction" resultsLabel="Named reactions found" ids={view.namedReactionIds} />
      <LinkedRecordsSection {...common} picker={picker} field="transformationIds" kind="transformation" label="Transformations" findLabel="Find a transformation by name" noun="transformation" resultsLabel="Transformations found" ids={view.transformationIds} />
      <ConceptsSection {...common} picker={picker} field="prerequisiteConceptIds" label="Prerequisite concepts" findLabel="Find a prerequisite concept by name" />
      <DifficultyField {...common} />
      <ShortTextField {...common} field="generalizedEquation" label="Generalised equation" hint="Plain text, for example R-CH2OH -> R-CHO. It is shown as typed and never parsed." />
      <KeptTextSection label="Atom-mapped reaction" value={view.mappedReaction} />
    </div>
  );
}
