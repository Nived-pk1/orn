/**
 * The Names section (ADR-040, step 6.1a part 4): canonical (required), display, iupac, qualifier, and the two list editors (common names,
 * aliases: add, remove, move up and down). Its own component so the 6.2 and 6.3 editors reuse it. It renders the draft's `names` and
 * reports each change as a recipe with the field path; it never trims or rewrites text and decides nothing about validity (the core's L1
 * does, and the findings panel shows it). An empty optional input means the field is absent (`names-model.ts`).
 */
import type { DraftRecipe } from '@/core/editing';
import { Button } from '@/ui/primitives';
import {
  addListItem,
  moveListItem,
  namesViewOf,
  removeListItem,
  setCanonical,
  setListItem,
  setOptional,
  type NameList,
  type OptionalNameField,
} from './names-model';
import styles from './editor.module.css';

export interface NamesSectionProps {
  /** The whole draft; the section reads its `names`. */
  readonly draft: unknown;
  /** `path` is given for typing into a field (edits to the same path within a second are ONE undo step) and absent for add, remove and move (each its own step). */
  readonly onEdit: (recipe: DraftRecipe, path?: string) => void;
  /** Field paths that have a finding now (marked invalid). */
  readonly invalid?: ReadonlySet<string>;
  /** Why editing is unavailable (a read-only tab); absent: it is available. */
  readonly unavailable?: string;
  /** A phone: the text field takes the whole row, Up, Down and Remove sit in one row under it, and the buttons are named by the text. */
  readonly phone?: boolean;
  /** Inside a SectionFrame, which supplies the heading: no section element and no heading of its own. */
  readonly framed?: boolean;
}

const OPTIONAL: readonly { readonly field: OptionalNameField; readonly label: string }[] = [
  { field: 'display', label: 'Display name' },
  { field: 'iupac', label: 'IUPAC name' },
  { field: 'qualifier', label: 'Qualifier' },
];

const LISTS: readonly { readonly list: NameList; readonly title: string; readonly one: string }[] = [
  { list: 'common', title: 'Common names', one: 'Common name' },
  { list: 'aliases', title: 'Aliases', one: 'Alias' },
];

/** The labels of the fields this section owns, by path (the conflict table shows them instead of raw paths). */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  'names.canonical': 'Canonical name',
  'names.display': 'Display name',
  'names.iupac': 'IUPAC name',
  'names.qualifier': 'Qualifier',
  'names.common': 'Common names',
  'names.aliases': 'Aliases',
};

export function namesFieldLabel(path: string): string | undefined {
  return FIELD_LABELS[path];
}

export function NamesSection(props: NamesSectionProps) {
  const { onEdit, unavailable } = props;
  const names = namesViewOf(props.draft);
  const bad = (path: string): boolean => props.invalid?.has(path) === true;
  const Wrapper = props.framed === true ? 'div' : 'section';
  return (
    <Wrapper {...(props.framed === true ? {} : { className: styles.section, 'aria-label': 'Names' })}>
      {props.framed === true ? null : <h3>Names</h3>}
      <div className={styles.field}>
        <label htmlFor="names-canonical">Canonical name (required)</label>
        <input
          id="names-canonical"
          type="text"
          value={names.canonical}
          readOnly={unavailable !== undefined}
          aria-invalid={bad('names.canonical') ? true : undefined}
          data-field-path="names.canonical"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onEdit(setCanonical(event.target.value), 'names.canonical')}
        />
      </div>
      {OPTIONAL.map(({ field, label }) => (
        <div className={styles.field} key={field}>
          <label htmlFor={`names-${field}`}>{label} (optional)</label>
          <input
            id={`names-${field}`}
            type="text"
            value={names[field]}
            readOnly={unavailable !== undefined}
            aria-invalid={bad(`names.${field}`) ? true : undefined}
            data-field-path={`names.${field}`}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onEdit(setOptional(field, event.target.value), `names.${field}`)}
          />
        </div>
      ))}
      {LISTS.map(({ list, title, one }) => {
        const items = names[list];
        return (
          <div className={styles.list} key={list} role="group" aria-label={title}>
            <h4>{title}</h4>
            {items.length === 0 ? <p className={styles.hint}>None.</p> : null}
            <ul>
              {items.map((item, index) => {
                const path = `names.${list}[${index}]`;
                const number = index + 1;
                const who = props.phone === true && item !== '' ? item : `${one.toLowerCase()} ${number}`;
                return (
                  // the list has no identity of its own: a row is its position
                  <li key={index} className={props.phone === true ? `${styles.row} ${styles.rowPhone}` : styles.row}>
                    <input
                      type="text"
                      value={item}
                      readOnly={unavailable !== undefined}
                      aria-label={`${one} ${number}`}
                      aria-invalid={bad(path) ? true : undefined}
                      data-field-path={path}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => onEdit(setListItem(list, index, event.target.value), path)}
                    />
                    <Button
                      aria-label={`Move ${who} up`}
                      {...(unavailable !== undefined ? { unavailable } : index === 0 ? { unavailable: 'it is the first' } : { onClick: () => onEdit(moveListItem(list, index, -1)) })}
                    >
                      Up
                    </Button>
                    <Button
                      aria-label={`Move ${who} down`}
                      {...(unavailable !== undefined ? { unavailable } : index === items.length - 1 ? { unavailable: 'it is the last' } : { onClick: () => onEdit(moveListItem(list, index, 1)) })}
                    >
                      Down
                    </Button>
                    <Button
                      aria-label={`Remove ${who}`}
                      {...(unavailable !== undefined ? { unavailable } : { onClick: () => onEdit(removeListItem(list, index)) })}
                    >
                      Remove
                    </Button>
                  </li>
                );
              })}
            </ul>
            <Button {...(unavailable !== undefined ? { unavailable } : { onClick: () => onEdit(addListItem(list)) })}>{`Add ${one.toLowerCase()}`}</Button>
          </div>
        );
      })}
    </Wrapper>
  );
}
