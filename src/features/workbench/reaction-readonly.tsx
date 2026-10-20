/**
 * What the reaction editor does not edit yet (step 6.3a decision D1), shown as short read-only summaries and kept unchanged by Save:
 * mechanism links, reversibility and classification (6.5), and notes,
 * citations, tags and the rest (6.6). Counts and words only; the draft is never changed here.
 */
import { wordsOf } from './reagent-model';
import styles from './editor.module.css';

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const fieldsOf = (draft: unknown): Fields => (isBag(draft) ? draft : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const excerpt = (value: unknown): string | undefined => {
  const t = text(value);
  if (t === '') return undefined;
  return t.length > 240 ? `${t.slice(0, 239)}... (${t.length.toLocaleString('en-US')} characters)` : t;
};

export function ClassificationReadOnlySection(props: { readonly draft: unknown }) {
  const fields = fieldsOf(props.draft);
  const reversibility = isBag(fields.reversibility) ? text(fields.reversibility.kind) : '';
  return (
    <div>
      <p className={styles.hint}>Editing arrives in step 6.6. These are kept unchanged when you save.</p>
      <p>Reversibility: {reversibility === '' ? 'not stated' : wordsOf(reversibility).toLowerCase()}.</p>
      <p>
        Named reactions: {list(fields.namedReactionIds).length}. Transformations: {list(fields.transformationIds).length}. Reaction types: {list(fields.reactionTypes).length}. Mechanism classes: {list(fields.mechanismClasses).length}. Concepts: {list(fields.conceptIds).length}. Prerequisite concepts: {list(fields.prerequisiteConceptIds).length}. Intermediates: {list(fields.intermediates).length}.
      </p>
    </div>
  );
}

export function ReactionNotesReadOnlySection(props: { readonly draft: unknown }) {
  const fields = fieldsOf(props.draft);
  const texts: readonly (readonly [string, string | undefined])[] = [
    ['Generalised equation', excerpt(fields.generalizedEquation)],
    ['Limitations', excerpt(fields.limitations)],
    ['Study notes', excerpt(fields.studyNotes)],
    ['Notes', excerpt(fields.notes)],
  ];
  return (
    <div>
      <p className={styles.hint}>Editing arrives in step 6.6. These are kept unchanged when you save.</p>
      {texts.map(([label, value]) => (value === undefined ? null : <p key={label}>{label}: {value}</p>))}
      <p className={styles.hint}>
        Tags: {list(fields.tags).length}. Citations: {list(fields.citations).length}.
      </p>
    </div>
  );
}
