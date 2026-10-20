/**
 * The fields of ONE expanded outcome, except its products (step 6.4b decision D1): "Holds under" (All conditions, or a choice of the
 * reaction's variants), selectivity, isomer group (choose one already used in this reaction or type a new one), regiochemistry,
 * stereochemistry (outcome, descriptors, note), rationale, and the mechanism link read-only. Text only; the recipes and the core decide.
 */
import { useState } from 'react';
import { SELECTIVITIES, STEREO_OUTCOMES } from '@/core/schema';
import { Button } from '@/ui/primitives';
import {
  addDescriptor,
  holdUnderAll,
  holdUnderVariant,
  removeDescriptor,
  removeStereo,
  setIsomerGroup,
  setRationale,
  setRegiochemistry,
  setSelectivity,
  setStereoNote,
  setStereoOutcome,
  type SelectivityValue,
  type StereoValue,
} from './outcome-model';
import { OutcomeMechanism } from './outcome-mechanism';
import type { MechanismLinksPort } from './mechanism-contracts';
import type { RecordPickerPort } from './record-picker-contracts';
import { isomerGroupsOf, variantChoicesOf, type OutcomeView } from './outcome-view';
import { wordsOf } from './reagent-model';
import type { SectionProps } from './section-props';
import styles from './editor.module.css';
import own from './participant.module.css';

export interface OutcomeFieldsProps extends SectionProps {
  readonly index: number;
  readonly outcome: OutcomeView;
  readonly picker?: RecordPickerPort | undefined;
  readonly links?: MechanismLinksPort | undefined;
}

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

export function OutcomeFields(props: OutcomeFieldsProps) {
  const { outcome, index, onEdit } = props;
  const locked = props.unavailable;
  const n = index + 1;
  const base = `outcomes[${index}]`;
  const variants = variantChoicesOf(props.draft);
  const groups = isomerGroupsOf(props.draft);
  const [descriptor, setDescriptor] = useState('');
  const [asking, setAsking] = useState(false);
  const all = outcome.variantIds.length === 0;
  const stereo = outcome.stereo;
  const stereoHasContent = stereo !== undefined && (stereo.descriptors.length > 0 || stereo.note !== '');
  return (
    <div className={own.participantBody}>
      <fieldset className={styles.choices} aria-label={`Holds under, outcome ${n}`} data-field-path={`${base}.conditionVariantIds`} aria-invalid={bad(props, `${base}.conditionVariantIds`)}>
        <legend>Holds under</legend>
        <label className={styles.choice}>
          <input type="checkbox" aria-label={`All conditions: outcome ${n}`} checked={all} disabled={locked !== undefined} onChange={() => onEdit(holdUnderAll(index))} />
          All conditions
        </label>
        {variants.map((variant, at) => (
          <label key={variant.id || at} className={styles.choice}>
            <input
              type="checkbox"
              aria-label={`${variant.label || variant.id}: outcome ${n}`}
              checked={outcome.variantIds.includes(variant.id)}
              disabled={locked !== undefined}
              onChange={(event) => onEdit(holdUnderVariant(index, variant.id, event.target.checked))}
            />
            {variant.label || variant.id}
          </label>
        ))}
        {variants.length === 0 ? <span className={styles.hint}>The reaction has no condition variants: the outcome holds under all conditions.</span> : null}
      </fieldset>
      <div className={own.participantGrid}>
        <div className={styles.field}>
          <label htmlFor={`o-sel-${index}`}>Selectivity</label>
          <select
            id={`o-sel-${index}`}
            aria-label={`Selectivity of outcome ${n}`}
            value={outcome.selectivity}
            disabled={locked !== undefined}
            aria-invalid={bad(props, `${base}.selectivity`)}
            data-field-path={`${base}.selectivity`}
            onChange={(event) => onEdit(setSelectivity(index, event.target.value as SelectivityValue))}
          >
            {(SELECTIVITIES as readonly string[]).includes(outcome.selectivity) ? null : (
              <option value={outcome.selectivity}>{outcome.selectivity === '' ? 'Choose a selectivity' : outcome.selectivity}</option>
            )}
            {SELECTIVITIES.map((value) => (
              <option key={value} value={value}>
                {wordsOf(value)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`o-regio-${index}`}>Regiochemistry</label>
          <input
            id={`o-regio-${index}`}
            type="text"
            aria-label={`Regiochemistry of outcome ${n}`}
            value={outcome.regiochemistry}
            readOnly={locked !== undefined}
            aria-invalid={bad(props, `${base}.regiochemistry`)}
            data-field-path={`${base}.regiochemistry`}
            autoComplete="off"
            onChange={(event) => onEdit(setRegiochemistry(index, event.target.value), `${base}.regiochemistry`)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`o-group-${index}`}>Isomer group</label>
          <input
            id={`o-group-${index}`}
            type="text"
            aria-label={`Isomer group of outcome ${n}`}
            value={outcome.isomerGroup}
            readOnly={locked !== undefined}
            aria-invalid={bad(props, `${base}.isomerGroup`)}
            data-field-path={`${base}.isomerGroup`}
            autoComplete="off"
            onChange={(event) => onEdit(setIsomerGroup(index, event.target.value), `${base}.isomerGroup`)}
          />
        </div>
        {groups.length === 0 ? null : (
          <div className={styles.field}>
            <label htmlFor={`o-use-${index}`}>Use a group named in this reaction</label>
            <select
              id={`o-use-${index}`}
              aria-label={`Use a named isomer group for outcome ${n}`}
              value=""
              disabled={locked !== undefined}
              onChange={(event) => event.target.value !== '' && onEdit(setIsomerGroup(index, event.target.value))}
            >
              <option value="">Choose a group</option>
              {groups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <fieldset className={styles.choices} aria-label={`Stereochemistry of outcome ${n}`}>
        <legend>Stereochemistry</legend>
        <div className={styles.field}>
          <label htmlFor={`o-stereo-${index}`}>Outcome</label>
          <select
            id={`o-stereo-${index}`}
            aria-label={`Stereochemical outcome of outcome ${n}`}
            value={stereo?.outcome ?? ''}
            disabled={locked !== undefined}
            aria-invalid={bad(props, `${base}.stereochemistry`)}
            data-field-path={`${base}.stereochemistry`}
            onChange={(event) => event.target.value !== '' && onEdit(setStereoOutcome(index, event.target.value as StereoValue))}
          >
            {stereo === undefined ? <option value="">Not stated</option> : null}
            {STEREO_OUTCOMES.map((value) => (
              <option key={value} value={value}>
                {wordsOf(value)}
              </option>
            ))}
          </select>
        </div>
        {stereo === undefined ? null : (
          <>
            <ul className={styles.list} aria-label={`Descriptors of outcome ${n}`}>
              {stereo.descriptors.map((one, at) => (
                <li key={`${one}-${at}`}>
                  {one}{' '}
                  <Button aria-label={`Remove descriptor ${one} of outcome ${n}`} {...(locked !== undefined ? { unavailable: locked } : { onClick: () => onEdit(removeDescriptor(index, at)) })}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
            <div className={styles.field}>
              <label htmlFor={`o-desc-${index}`}>Add a descriptor (for example Z)</label>
              <input id={`o-desc-${index}`} type="text" value={descriptor} readOnly={locked !== undefined} autoComplete="off" onChange={(event) => setDescriptor(event.target.value)} />
              <Button
                aria-label={`Add descriptor to outcome ${n}`}
                {...(locked !== undefined
                  ? { unavailable: locked }
                  : descriptor.trim() === ''
                    ? { unavailable: 'write it first' }
                    : {
                        onClick: () => {
                          onEdit(addDescriptor(index, descriptor.trim()));
                          setDescriptor('');
                        },
                      })}
              >
                Add descriptor
              </Button>
            </div>
            <div className={styles.field}>
              <label htmlFor={`o-snote-${index}`}>Stereochemistry note</label>
              <textarea
                id={`o-snote-${index}`}
                aria-label={`Stereochemistry note of outcome ${n}`}
                value={stereo.note}
                readOnly={locked !== undefined}
                aria-invalid={bad(props, `${base}.stereochemistry.note`)}
                data-field-path={`${base}.stereochemistry.note`}
                onChange={(event) => onEdit(setStereoNote(index, event.target.value), `${base}.stereochemistry.note`)}
              />
            </div>
            {asking ? (
              <div className={styles.confirm} role="group" aria-label={`Remove the stereochemistry of outcome ${n}?`}>
                <span>The outcome's descriptors and note go with it.</span>
                <Button
                  variant="primary"
                  onClick={() => {
                    onEdit(removeStereo(index));
                    setAsking(false);
                  }}
                >
                  Remove the stereochemistry
                </Button>
                <Button onClick={() => setAsking(false)}>Cancel</Button>
              </div>
            ) : (
              <Button
                aria-label={`Remove stereochemistry of outcome ${n}`}
                {...(locked !== undefined
                  ? { unavailable: locked }
                  : {
                      onClick: () => (stereoHasContent ? setAsking(true) : onEdit(removeStereo(index))),
                    })}
              >
                Remove stereochemistry
              </Button>
            )}
          </>
        )}
      </fieldset>
      <div className={styles.field}>
        <label htmlFor={`o-why-${index}`}>Rationale</label>
        <textarea
          id={`o-why-${index}`}
          aria-label={`Rationale of outcome ${n}`}
          value={outcome.rationale}
          readOnly={locked !== undefined}
          aria-invalid={bad(props, `${base}.rationale`)}
          data-field-path={`${base}.rationale`}
          onChange={(event) => onEdit(setRationale(index, event.target.value), `${base}.rationale`)}
        />
      </div>
      <OutcomeMechanism draft={props.draft} onEdit={onEdit} index={index} picker={props.picker} links={props.links} {...(props.invalid === undefined ? {} : { invalid: props.invalid })} {...(locked === undefined ? {} : { unavailable: locked })} />
    </div>
  );
}
