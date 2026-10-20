/**
 * The mechanism link of ONE expanded outcome (step 6.5a decision D5): a mechanism chosen among the ones the reaction links, "None", or
 * "Link another mechanism to the reaction" (a picker; the mechanism is linked to the reaction and to the outcome in ONE edit); then one of that
 * mechanism's variants (or none). Changing the mechanism drops the variant, and the hint says so. A mechanism the outcome names but the reaction
 * does not link stays selectable and says so (nothing is changed silently). Text only; the recipes decide.
 */
import { useState } from 'react';
import type { MechanismLinksPort } from './mechanism-contracts';
import { linkedIdsOf, outcomeLinkOf, setOutcomeMechanism, setOutcomeVariant } from './mechanism-link-model';
import { RecordPicker } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import type { SectionProps } from './section-props';
import styles from './editor.module.css';

export interface OutcomeMechanismProps extends SectionProps {
  readonly index: number;
  readonly picker?: RecordPickerPort | undefined;
  readonly links?: MechanismLinksPort | undefined;
}

const OTHER = '__other';

export function OutcomeMechanism(props: OutcomeMechanismProps) {
  const { index, onEdit, picker } = props;
  const n = index + 1;
  const locked = props.unavailable;
  const base = `outcomes[${index}].mechanism`;
  const link = outcomeLinkOf(props.draft, index);
  const linked = linkedIdsOf(props.draft);
  const [other, setOther] = useState(false);
  const [said, setSaid] = useState('');
  const nameOf = (id: string): string => picker?.describe('mechanism', id)?.name ?? id;
  const variants = link.mechanismId === '' ? [] : (props.links?.variantsOf(link.mechanismId) ?? []);
  const variantKnown = link.variantId === '' || variants.some((variant) => variant.id === link.variantId);
  return (
    <div className={styles.field}>
      <label htmlFor={`o-mech-${index}`}>Mechanism</label>
      <select
        id={`o-mech-${index}`}
        aria-label={`Mechanism of outcome ${n}`}
        value={other ? OTHER : link.mechanismId}
        disabled={locked !== undefined}
        aria-invalid={props.invalid?.has(base) === true ? true : undefined}
        data-field-path={base}
        onChange={(event) => {
          const value = event.target.value;
          if (value === OTHER) {
            setOther(true);
            return;
          }
          setOther(false);
          const dropped = link.variantId !== '' && value !== link.mechanismId;
          onEdit(setOutcomeMechanism(index, value));
          setSaid(dropped ? "The variant was cleared: it belongs to the other mechanism. Choose one of this mechanism's variants." : '');
        }}
      >
        <option value="">None</option>
        {link.mechanismId !== '' && !linked.includes(link.mechanismId) ? <option value={link.mechanismId}>{nameOf(link.mechanismId)} (not linked to this reaction)</option> : null}
        {linked.map((id) => (
          <option key={id} value={id}>
            {nameOf(id)}
          </option>
        ))}
        <option value={OTHER}>Link another mechanism to the reaction</option>
      </select>
      {other ? (
        <RecordPicker
          id={`o-mech-find-${index}`}
          label={`Find the mechanism for outcome ${n} by name`}
          kinds={['mechanism']}
          port={picker}
          noun="mechanism"
          resultsLabel="Mechanisms found"
          unavailable={locked}
          isListed={() => false}
          onPick={(choice) => {
            onEdit(setOutcomeMechanism(index, choice.id));
            setOther(false);
            setSaid(`${choice.name} was linked to the reaction and to outcome ${n}.`);
          }}
        />
      ) : null}
      <label htmlFor={`o-mech-var-${index}`}>Variant</label>
      <select
        id={`o-mech-var-${index}`}
        aria-label={`Variant of outcome ${n}`}
        value={link.variantId}
        disabled={locked !== undefined || link.mechanismId === ''}
        aria-invalid={props.invalid?.has(`${base}.variantId`) === true ? true : undefined}
        data-field-path={`${base}.variantId`}
        onChange={(event) => onEdit(setOutcomeVariant(index, event.target.value))}
      >
        <option value="">No variant</option>
        {!variantKnown ? <option value={link.variantId}>{link.variantId} (not a variant of this mechanism)</option> : null}
        {variants.map((variant) => (
          <option key={variant.id} value={variant.id}>
            {variant.label}
          </option>
        ))}
      </select>
      <p className={styles.hint} role="status">
        {said}
      </p>
    </div>
  );
}
