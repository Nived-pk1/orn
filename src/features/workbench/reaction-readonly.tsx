/**
 * What the reaction editor does not edit yet (step 6.3a decision D1), shown as short read-only summaries and kept unchanged by Save:
 * conditions, variants and outcomes ("Editing arrives in step 6.4"), mechanism links, reversibility and classification (6.5), and notes,
 * citations, tags and the rest (6.6). Counts and words only; the draft is never changed here.
 */
import { wordsOf } from './reagent-model';
import styles from './editor.module.css';

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const fieldsOf = (draft: unknown): Fields => (isBag(draft) ? draft : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;
const excerpt = (value: unknown): string | undefined => {
  const t = text(value);
  if (t === '') return undefined;
  return t.length > 240 ? `${t.slice(0, 239)}... (${t.length.toLocaleString('en-US')} characters)` : t;
};

export function ConditionsReadOnlySection(props: { readonly draft: unknown }) {
  const fields = fieldsOf(props.draft);
  const variants = list(fields.conditionVariants).map((v) => (isBag(v) ? text(v.label) : ''));
  const outcomes = list(fields.outcomes);
  const stagesWithConditions = list(fields.stages).filter((s) => isBag(s) && (text((s.parameters as Fields | undefined)?.text) !== '' || Object.keys(isBag(s.parameters) ? s.parameters : {}).some((k) => !['solventCharacter', 'activation', 'other', 'parsedFields', 'text'].includes(k)))).length;
  return (
    <div>
      <p className={styles.hint}>Stage conditions are edited under Stages. Variants and outcomes: editing arrives in step 6.4. These are kept unchanged when you save.</p>
      <p>
        Stage conditions: {stagesWithConditions === 0 ? 'none stated' : `${plural(stagesWithConditions, 'stage')} with conditions`}. Condition variants: {variants.length === 0 ? 'none' : variants.map((label) => `'${label}'`).join(', ')}.
      </p>
      <p>
        Outcomes: {outcomes.length === 0 ? 'none yet (a draft without outcomes saves with a warning; publishing needs one)' : plural(outcomes.length, 'outcome')}.
      </p>
      {outcomes.length === 0 ? null : (
        <ul>
          {outcomes.map((outcome, index) => {
            const o = isBag(outcome) ? outcome : {};
            return (
              <li key={text(o.id) || index}>
                {text(o.label) === '' ? `Outcome ${index + 1}` : text(o.label)}: {wordsOf(text(o.selectivity) || 'unspecified').toLowerCase()}, {plural(list(o.products).length, 'product')}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ClassificationReadOnlySection(props: { readonly draft: unknown }) {
  const fields = fieldsOf(props.draft);
  const reversibility = isBag(fields.reversibility) ? text(fields.reversibility.kind) : '';
  return (
    <div>
      <p className={styles.hint}>Editing arrives in step 6.5. These are kept unchanged when you save.</p>
      <p>Reversibility: {reversibility === '' ? 'not stated' : wordsOf(reversibility).toLowerCase()}.</p>
      <p>
        Named reactions: {list(fields.namedReactionIds).length}. Transformations: {list(fields.transformationIds).length}. Reaction types: {list(fields.reactionTypes).length}. Mechanism classes: {list(fields.mechanismClasses).length}. Mechanisms: {list(fields.mechanismIds).length}. Concepts: {list(fields.conceptIds).length}. Prerequisite concepts: {list(fields.prerequisiteConceptIds).length}. Intermediates: {list(fields.intermediates).length}.
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
