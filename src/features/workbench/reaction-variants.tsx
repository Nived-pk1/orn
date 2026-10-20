/**
 * The reaction editor's Condition variants section (step 6.4a decision D3 and D4): each variant is ONE summary line ("443 K, excess acid: stage 1
 * temperature 443 K") with Edit, Up, Down and Remove; the open one (one at a time) holds its label, the stage it overrides and ONLY the fields it
 * overrides ("Add a field to override" picks one; Remove takes it out). Removing a variant an outcome names is refused in words (outcomes are
 * edited in step 6.4b); one no outcome names asks first, and says which participants become common. Text only; the recipes decide.
 */
import { useState } from 'react';
import { Button } from '@/ui/primitives';
import { ConditionFields, type ConditionFieldName } from './condition-fields';
import { clearField, hasField, parametersOf, variantLoc, type ParameterField } from './condition-model';
import conditionStyles from './condition.module.css';
import { stagesViewOf } from './stage-model';
import type { SectionProps } from './section-props';
import { wordsOf } from './reagent-model';
import { ADDABLE_OVERRIDES, addVariant, moveVariant, outcomeNaming, overridesOf, removeVariant, setVariantLabel, setVariantStage, variantsViewOf, variantSummary, type OverrideField } from './variant-model';
import styles from './editor.module.css';

export interface VariantsSectionProps extends SectionProps {
  /** A fresh variant ID ('cvr_...'). */
  readonly newId: (prefix: string) => string;
}

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);
const plural = (count: number, one: string): string => `${count} ${one}${count === 1 ? '' : 's'}`;

export function VariantsSection(props: VariantsSectionProps) {
  const variants = variantsViewOf(props.draft);
  const stages = stagesViewOf(props.draft);
  const { onEdit } = props;
  const locked = props.unavailable;
  const [openId, setOpenId] = useState<string | null>(null);
  /** The fields added to a variant's overrides that have no value yet (a field with a value is shown anyway); by variant ID. */
  const [added, setAdded] = useState<Readonly<Record<string, readonly OverrideField[]>>>({});
  const [asking, setAsking] = useState<number | null>(null);
  const [said, setSaid] = useState('');
  const [label, setLabel] = useState('');
  const [stage, setStage] = useState('');
  const stageChoice = stages.length === 1 ? (stages[0]?.id ?? '') : stage;
  const addReason = label.trim() === '' ? 'write its label first' : stages.length >= 2 && stageChoice === '' ? 'choose the stage it overrides first' : undefined;
  const stageName = (at: number): string => `Stage ${at + 1}${stages[at]?.label === '' ? '' : `: ${stages[at]?.label}`} (${wordsOf(stages[at]?.kind ?? '').toLowerCase()})`;
  const off = (action: () => void, why?: string) => (locked !== undefined ? { unavailable: locked } : why !== undefined ? { unavailable: why } : { onClick: action });
  const removeNow = (index: number): void => {
    const gone = variants[index];
    onEdit(removeVariant(index));
    setAsking(null);
    if (openId === gone?.id) setOpenId(null);
    setSaid(`Variant ${index + 1} was removed.`);
  };
  return (
    <div>
      {variants.length === 0 ? <p className={styles.hint}>No condition variants: the stages' conditions hold for every outcome. Add a variant for conditions that lead to different outcomes (for example 413 K and 443 K).</p> : null}
      <ul className={styles.list} aria-label="Condition variants" data-field-path="conditionVariants">
        {variants.map((variant, index) => {
          const n = index + 1;
          const base = `conditionVariants[${index}]`;
          const open = openId === variant.id;
          const loc = variantLoc(index);
          const params = parametersOf(props.draft, loc);
          const refusal = outcomeNaming(props.draft, variant.id, variant.label);
          const shown = new Set<ConditionFieldName>([...overridesOf(props.draft, index), ...(added[variant.id] ?? [])]);
          const choices = ADDABLE_OVERRIDES.filter((one) => !shown.has(one.field));
          const ask = asking === index;
          return (
            <li key={variant.id || index} className={styles.panel} data-testid="variant-row">
              <div role="group" aria-label={`Variant ${n}`} className={styles.participantBody}>
                <div className={styles.participantHead}>
                  <span className={conditionStyles.summary} data-testid="variant-summary" aria-invalid={bad(props, base)}>
                    {n}. {variantSummary(props.draft, index)}
                  </span>
                  <div className={styles.participantActions}>
                    <Button aria-label={`${open ? 'Close' : 'Edit'} variant ${n}`} aria-expanded={open} data-field-path={base} data-open-row="" onClick={() => setOpenId(open ? null : variant.id)}>
                      {open ? 'Close' : 'Edit'}
                    </Button>
                    <Button aria-label={`Move variant ${n} up`} {...off(() => onEdit(moveVariant(index, -1)), index === 0 ? 'it is first' : undefined)}>
                      Up
                    </Button>
                    <Button aria-label={`Move variant ${n} down`} {...off(() => onEdit(moveVariant(index, 1)), index === variants.length - 1 ? 'it is last' : undefined)}>
                      Down
                    </Button>
                    <Button aria-label={`Remove variant ${n}`} {...off(() => setAsking(index), refusal)}>
                      Remove
                    </Button>
                  </div>
                </div>
                {refusal === undefined ? null : <p className={styles.hint}>{refusal}</p>}
                {ask ? (
                  <div className={styles.confirm} role="group" aria-label={`Remove variant ${n}?`}>
                    <span>
                      No outcome names variant {n}.
                      {variant.participantCount > 0 ? ` It lists ${plural(variant.participantCount, 'participant')} present only under it; they become common to every condition.` : ''}
                    </span>
                    <Button variant="primary" onClick={() => removeNow(index)}>
                      Remove the variant
                    </Button>
                    <Button onClick={() => setAsking(null)}>Cancel</Button>
                  </div>
                ) : null}
                {open ? (
                  <>
                    <div className={styles.participantGrid}>
                      <div className={styles.field}>
                        <label htmlFor={`variant-label-${index}`}>Label (required)</label>
                        <input id={`variant-label-${index}`} type="text" aria-label={`Label of variant ${n}`} value={variant.label} readOnly={locked !== undefined} aria-invalid={bad(props, `${base}.label`)} data-field-path={`${base}.label`} autoComplete="off" onChange={(event) => onEdit(setVariantLabel(index, event.target.value), `${base}.label`)} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor={`variant-stage-${index}`}>Stage it overrides</label>
                        <select id={`variant-stage-${index}`} aria-label={`Stage of variant ${n}`} value={variant.stageId} disabled={locked !== undefined} aria-invalid={bad(props, `${base}.stageId`)} data-field-path={`${base}.stageId`} onChange={(event) => onEdit(setVariantStage(index, event.target.value))}>
                          {variant.stageId === '' ? <option value="">{stages.length === 0 ? 'No stage yet' : 'Not named: the first stage of kind reaction'}</option> : null}
                          {variant.stageId !== '' && !stages.some((s) => s.id === variant.stageId) ? <option value={variant.stageId}>{variant.stageId} (not a stage of this reaction)</option> : null}
                          {stages.map((s, at) => (
                            <option key={s.id || at} value={s.id}>
                              {stageName(at)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {shown.size === 0 ? <p className={styles.hint}>This variant overrides nothing yet. Add a field to override; the other fields keep the stage's values.</p> : null}
                    {hasField(params, 'solventCharacter') ? <p className={styles.hint}>A variant's solvent character does not reach the arrow (the arrow never writes it).</p> : null}
                    <ConditionFields
                      draft={props.draft}
                      onEdit={onEdit}
                      loc={loc}
                      who={`variant ${n}`}
                      only={shown}
                      onRemove={(field) => {
                        onEdit(clearField(loc, field as ParameterField | 'other' | 'text'));
                        setAdded((now) => ({ ...now, [variant.id]: (now[variant.id] ?? []).filter((one) => one !== field) }));
                      }}
                      {...(props.invalid === undefined ? {} : { invalid: props.invalid })}
                      {...(locked === undefined ? {} : { unavailable: locked })}
                      {...(props.phone === undefined ? {} : { phone: props.phone })}
                    />
                    <div className={styles.field}>
                      <label htmlFor={`variant-add-${index}`}>Add a field to override</label>
                      <select
                        id={`variant-add-${index}`}
                        value=""
                        disabled={locked !== undefined || choices.length === 0}
                        onChange={(event) => {
                          const field = event.target.value as OverrideField;
                          if (field !== ('' as string)) setAdded((now) => ({ ...now, [variant.id]: [...(now[variant.id] ?? []), field] }));
                        }}
                      >
                        <option value="">Choose a field</option>
                        {choices.map((one) => (
                          <option key={one.field} value={one.field}>
                            {one.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className={styles.participantGrid}>
        <div className={styles.field}>
          <label htmlFor="new-variant-label">Label of a new variant (required)</label>
          <input id="new-variant-label" type="text" value={label} readOnly={locked !== undefined} autoComplete="off" onChange={(event) => setLabel(event.target.value)} />
        </div>
        {stages.length >= 2 ? (
          <div className={styles.field}>
            <label htmlFor="new-variant-stage">Stage it overrides</label>
            <select id="new-variant-stage" value={stage} disabled={locked !== undefined} onChange={(event) => setStage(event.target.value)}>
              <option value="">Choose a stage</option>
              {stages.map((s, at) => (
                <option key={s.id || at} value={s.id}>
                  {stageName(at)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <p className={styles.hint}>{stages.length === 0 ? 'The reaction has no stage yet: add one under Stages for the variant to override.' : stages.length === 1 ? 'A new variant overrides stage 1, the only stage.' : 'Choose which stage a new variant overrides.'}</p>
      <Button
        {...off(() => {
          const id = props.newId('cvr');
          onEdit(addVariant(id, label.trim(), stageChoice === '' ? undefined : stageChoice));
          setOpenId(id);
          setLabel('');
          setStage('');
          setSaid(`Variant ${variants.length + 1} was added; it overrides nothing yet. Add a field to override.`);
        }, addReason)}
      >
        Add variant
      </Button>
      <p className={styles.hint} role="status">
        {said}
      </p>
    </div>
  );
}
