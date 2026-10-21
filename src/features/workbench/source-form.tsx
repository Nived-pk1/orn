/**
 * The source form (step 6.6a, decision C2): Identity (kind of source with no default, title, authors, year, edition, publisher, web address,
 * identifier), Notes, tags and citations (the shared section; a source has Notes only), Review. Collapsible and keyboard-navigable
 * (SectionFrame). A bad web address is the schema finding (only http and https). No chemistry, no rules: the draft and the schema decide.
 */
import { REFERENCE_KINDS } from '@/core/schema';
import type { RecordPickerPort } from './record-picker-contracts';
import { SectionFrame } from './section-frame';
import type { SectionProps } from './section-props';
import { SharedFieldsSection } from './shared-bundle';
import { addAuthor, moveAuthor, REF_KIND_WORDS, removeAuthor, setAuthor, setRefKind, setSourceText, setYear, sourceViewOf } from './source-model';
import { ReviewSection } from './species-sections';
import { StringListEditor } from './string-list-editor';
import styles from './editor.module.css';

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

function SourceIdentitySection(props: SectionProps) {
  const view = sourceViewOf(props.draft);
  const { onEdit } = props;
  const locked = props.unavailable !== undefined;
  const text = (id: string, label: string, field: 'title' | 'edition' | 'publisher' | 'url' | 'identifier', value: string, hint?: string) => (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value} readOnly={locked} aria-invalid={bad(props, field)} data-field-path={field} autoComplete="off" spellCheck={false} onChange={(event) => onEdit(setSourceText(field, event.target.value), field)} />
      {hint === undefined ? null : <p className={styles.hint}>{hint}</p>}
    </div>
  );
  return (
    <div>
      <div className={styles.field}>
        <label htmlFor="source-kind">Kind of source</label>
        <select id="source-kind" value={view.refKind} disabled={locked} aria-invalid={bad(props, 'refKind')} data-field-path="refKind" onChange={(event) => onEdit(setRefKind(event.target.value), 'refKind')}>
          <option value="">Choose a kind</option>
          {REFERENCE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {REF_KIND_WORDS[kind]}
            </option>
          ))}
        </select>
      </div>
      {text('source-title', 'Title (required)', 'title', view.title)}
      <StringListEditor
        title="Authors"
        one="Author"
        items={view.authors}
        path="authors"
        invalid={props.invalid}
        unavailable={props.unavailable}
        phone={props.phone}
        onSet={(index, value, path) => onEdit(setAuthor(index, value), path)}
        onAdd={() => onEdit(addAuthor())}
        onRemove={(index) => onEdit(removeAuthor(index))}
        onMove={(index, by) => onEdit(moveAuthor(index, by))}
      />
      <div className={styles.field}>
        <label htmlFor="source-year">Year</label>
        <input id="source-year" type="text" inputMode="numeric" value={view.year} readOnly={locked} aria-invalid={bad(props, 'year')} data-field-path="year" autoComplete="off" onChange={(event) => onEdit(setYear(event.target.value), 'year')} />
      </div>
      {text('source-edition', 'Edition', 'edition', view.edition)}
      {text('source-publisher', 'Publisher', 'publisher', view.publisher)}
      {text('source-identifier', 'Identifier (ISBN, DOI or paper code)', 'identifier', view.identifier)}
      {text('source-url', 'Web address (http or https)', 'url', view.url, 'Shown as text with a link that opens in a new tab; nothing is fetched.')}
    </div>
  );
}

export interface SourceFormProps extends SectionProps {
  readonly picker?: RecordPickerPort | undefined;
}

export function SourceForm(props: SourceFormProps) {
  const open = props.phone !== true;
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...(props.unavailable === undefined ? {} : { unavailable: props.unavailable }), ...(props.phone === undefined ? {} : { phone: props.phone }) };
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="identity" title="Identity">
        <SourceIdentitySection {...common} />
      </SectionFrame>
      <SectionFrame id="shared" title="Notes, tags and citations" initiallyOpen={open}>
        <SharedFieldsSection {...common} notes={['notes']} picker={props.picker} />
      </SectionFrame>
      <SectionFrame id="review" title="Review" initiallyOpen={open}>
        <ReviewSection {...common} />
      </SectionFrame>
    </div>
  );
}
