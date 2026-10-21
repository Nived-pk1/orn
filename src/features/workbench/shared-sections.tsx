/**
 * The shared record fields, one set of components for every editor (step 6.6a, decision C1): Notes and Study notes (the rich text field),
 * Tags (chips; Enter or a comma adds, a button removes), Concepts (the generic picker over concept records) and Citations (summary
 * lines with Edit, Up, Down and Remove; a citation picks a SOURCE and fills its own locator and note). They report every change as a
 * recipe; the draft and the schema decide. A source cannot be made from a citation row (nested sessions are step 6.7). No chemistry.
 */
import { useState, type KeyboardEvent } from 'react';
import { Button } from '@/ui/primitives';
import { genericText, setGenericField } from './generic-model';
import type { MechanismLinksPort } from './mechanism-contracts';
import { RecordList, RecordPicker } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import { RichTextField } from './rich-text-field';
import type { SectionProps } from './section-props';
import { addCitation, addConcept, addTag, citationLine, citationsOf, conceptIdsOf, moveCitation, removeCitation, removeConcept, removeTag, setCitationField, setTextField, tagProblem, tagsOf, textOf } from './shared-model';
import styles from './editor.module.css';

const NOTE_LABELS: Readonly<Record<string, string>> = { notes: 'Notes', studyNotes: 'Study notes', acidBaseNotes: 'Acid-base notes', description: 'Description', 'generic.rGroupNote': 'R-group note', limitations: 'Limitations', summary: 'Summary', typicalConditions: 'Typical conditions' };

export function NotesSection(props: SectionProps & { readonly fields: readonly string[]; readonly links?: MechanismLinksPort | undefined }) {
  return (
    <div>
      {props.fields.map((field) => {
        const nested = field.startsWith('generic.'); // a class R-group note lives in its generic block
        return (
        <RichTextField
          key={field}
          id={`shared-${field}`}
          label={NOTE_LABELS[field] ?? field}
          path={field}
          value={nested ? genericText(props.draft, field.slice(8)) : textOf(props.draft, field)}
          invalid={props.invalid?.has(field) === true}
          unavailable={props.unavailable}
          phone={props.phone}
          linkExists={props.links?.exists}
          linkName={props.links?.name}
          onChange={(value) => props.onEdit(nested ? setGenericField(field.slice(8), value === '' ? undefined : value) : setTextField(field, value), field)}
        />
        );
      })}
    </div>
  );
}

export function TagsSection(props: SectionProps) {
  const tags = tagsOf(props.draft);
  const locked = props.unavailable !== undefined;
  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ readonly kind: 'refusal' | 'note'; readonly text: string } | null>(null);

  /** Adds each piece; stops at the first refusal and keeps that piece (and the rest) in the input. Returns what is left to type. */
  const addPieces = (pieces: readonly string[], seen: readonly string[]): string => {
    let have = seen;
    let note: string | undefined;
    for (const [at, piece] of pieces.entries()) {
      const problem = tagProblem(have, piece);
      if (problem.refusal !== undefined) {
        setMessage({ kind: 'refusal', text: problem.refusal });
        return pieces.slice(at).join(',');
      }
      props.onEdit(addTag(piece));
      have = [...have, piece];
      note = problem.note ?? note;
    }
    setMessage(note === undefined ? null : { kind: 'note', text: note });
    return '';
  };
  const onChange = (value: string): void => {
    if (!value.includes(',')) {
      setText(value);
      return;
    }
    const parts = value.split(',');
    const rest = parts.pop() ?? '';
    const kept = addPieces(parts.filter((part) => part !== ''), tags);
    setText(kept === '' ? rest : [kept, rest].join(','));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    setText(addPieces([text], tags));
  };
  return (
    <div className={styles.list} role="group" aria-label="Tags">
      <h4>Tags</h4>
      {tags.length === 0 ? <p className={styles.hint}>None.</p> : null}
      <ul className={styles.chips} aria-label="Tag list">
        {tags.map((tag, index) => (
          <li key={`${index}:${tag}`} className={styles.chip}>
            <span>{tag}</span>
            <Button aria-label={`Remove tag ${tag}`} {...(locked ? { unavailable: props.unavailable } : { onClick: () => props.onEdit(removeTag(index)) })}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <div className={styles.field}>
        <label htmlFor="shared-tag-input">Add a tag</label>
        <input id="shared-tag-input" type="text" value={text} readOnly={locked} autoComplete="off" spellCheck={false} data-field-path="tags" aria-invalid={props.invalid?.has('tags') === true ? true : undefined} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} />
        <p className={styles.hint}>Press Enter or type a comma to add. The text is kept as typed (at most 64 characters).</p>
      </div>
      {message === null ? null : message.kind === 'refusal' ? (
        <p role="alert" className={styles.hint}>{message.text}</p>
      ) : (
        <p role="status" className={styles.hint}>{message.text}</p>
      )}
    </div>
  );
}

export function ConceptsSection(props: SectionProps & { readonly picker: RecordPickerPort | undefined; readonly field?: string; readonly label?: string; readonly findLabel?: string }) {
  const field = props.field ?? 'conceptIds';
  const ids = conceptIdsOf(props.draft, field);
  return (
    <div>
      <RecordList label={props.label ?? 'Concepts'} fieldPath={field} items={ids.map((id) => ({ kind: 'concept' as const, id }))} port={props.picker} unavailable={props.unavailable} emptyText={props.label === undefined ? 'No concepts.' : 'None.'} onRemove={(index) => props.onEdit(removeConcept(index, field))} />
      <RecordPicker id={`shared-${field}-search`} label={props.findLabel ?? 'Find a concept by name'} kinds={['concept']} port={props.picker} noun="concept" resultsLabel="Concepts found" unavailable={props.unavailable} isListed={(choice) => ids.includes(choice.id)} onPick={(choice) => props.onEdit(addConcept(choice.id, field))} />
    </div>
  );
}

export function CitationsSection(props: SectionProps & { readonly picker: RecordPickerPort | undefined; readonly path?: string; readonly label?: string }) {
  const path = props.path ?? 'citations';
  const label = props.label ?? 'Citations';
  const citations = citationsOf(props.draft, path);
  const locked = props.unavailable !== undefined;
  const [openAt, setOpenAt] = useState<number | null>(null);
  const { picker } = props;
  const noSources = picker?.count?.('reference') === 0;
  return (
    <div className={styles.list} role="group" aria-label={`${label} section`}>
      <h4>{label}</h4>
      {citations.length === 0 ? <p className={styles.hint}>None.</p> : null}
      <ul aria-label={label}>
        {citations.map((citation, index) => {
          const line = citationLine(picker?.sourceOf?.(citation.referenceId), citation);
          const bare = citationLine(picker?.sourceOf?.(citation.referenceId), { referenceId: citation.referenceId });
          const open = openAt === index;
          return (
            <li key={`${index}:${citation.referenceId}`} data-phone={props.phone === true ? 'true' : undefined} className={props.phone === true ? `${styles.row} ${styles.rowPhone}` : styles.row}>
              <span>{line}</span>
              <Button aria-label={`Edit citation ${bare}`} aria-expanded={open} onClick={() => setOpenAt(open ? null : index)}>
                Edit
              </Button>
              <Button aria-label={`Move citation ${bare} up`} {...(locked ? { unavailable: props.unavailable } : index === 0 ? { unavailable: 'it is the first' } : { onClick: () => props.onEdit(moveCitation(path, index, -1)) })}>
                Up
              </Button>
              <Button aria-label={`Move citation ${bare} down`} {...(locked ? { unavailable: props.unavailable } : index === citations.length - 1 ? { unavailable: 'it is the last' } : { onClick: () => props.onEdit(moveCitation(path, index, 1)) })}>
                Down
              </Button>
              <Button aria-label={`Remove citation ${bare}`} {...(locked ? { unavailable: props.unavailable } : { onClick: () => { setOpenAt(null); props.onEdit(removeCitation(path, index)); } })}>
                Remove
              </Button>
              {!open ? null : (
                <div className={styles.field}>
                  <label htmlFor={`${path}-${index}-locator`}>Locator</label>
                  <input id={`${path}-${index}-locator`} type="text" value={citation.locator} readOnly={locked} autoComplete="off" data-field-path={`${path}[${index}].locator`} aria-invalid={props.invalid?.has(`${path}[${index}].locator`) === true ? true : undefined} onChange={(event) => props.onEdit(setCitationField(path, index, 'locator', event.target.value), `${path}[${index}].locator`)} />
                  <p className={styles.hint}>Where in the source: a page, a chapter, a table.</p>
                  <label htmlFor={`${path}-${index}-note`}>Citation note</label>
                  <textarea id={`${path}-${index}-note`} rows={3} value={citation.note} readOnly={locked} autoComplete="off" spellCheck={false} data-field-path={`${path}[${index}].note`} aria-invalid={props.invalid?.has(`${path}[${index}].note`) === true ? true : undefined} onChange={(event) => props.onEdit(setCitationField(path, index, 'note', event.target.value), `${path}[${index}].note`)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {noSources ? (
        <p className={styles.hint}>No sources yet. Add one with New source (Workbench).</p>
      ) : (
        <RecordPicker id={`${path}-source-search`} label="Find a source by title" kinds={['reference']} port={picker} noun="source" resultsLabel="Sources found" unavailable={props.unavailable} isListed={() => false} onPick={(choice) => props.onEdit(addCitation(path, choice.id))} />
      )}
      <p className={styles.hint}>A new source cannot be made here: use New source (Workbench). Making one from a citation arrives in step 6.7.</p>
    </div>
  );
}
