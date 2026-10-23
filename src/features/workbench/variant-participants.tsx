/**
 * The participants present only under ONE condition variant (step 6.9b, G1). The schema stores them as the variant's `participantIds`: each is an
 * ordinary participant of the reaction (own role, in exactly one stage) that the variant LISTS; a participant no variant lists is common. So this
 * is a checklist of the reaction's participants, and "Add it as" + a search that makes a new participant (the same role choice and picker as the
 * Participants section) and lists it here. Text only; the recipes and the rules decide.
 */
import { useState } from 'react';
import { PARTICIPANT_ROLES } from '@/core/schema';
import { addParticipant, participantsViewOf, type ParticipantRoleValue } from './participant-model';
import { RecordPicker } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import { wordsOf } from './reagent-model';
import type { SectionProps } from './section-props';
import { setVariantParticipant } from './variant-model';
import styles from './editor.module.css';

export interface VariantParticipantsProps extends SectionProps {
  /** The variant's position (0-based) and its list of participant IDs. */
  readonly index: number;
  readonly listed: readonly string[];
  readonly picker?: RecordPickerPort | undefined;
  /** A fresh participant ID ('prt_...'). */
  readonly newId: (prefix: string) => string;
}

export function VariantParticipants(props: VariantParticipantsProps) {
  const { index, listed, onEdit, picker } = props;
  const locked = props.unavailable;
  const n = index + 1;
  const participants = participantsViewOf(props.draft);
  const [role, setRole] = useState<ParticipantRoleValue>('reactant');
  const [said, setSaid] = useState('');
  const nameOf = (at: number): string => {
    const substance = participants[at]?.substance;
    return (substance === undefined ? undefined : picker?.describe(substance.kind, substance.id)?.name) ?? `participant ${at + 1}`;
  };
  return (
    <fieldset className={styles.choices} aria-label={`Present only under variant ${n}`} data-field-path={`conditionVariants[${index}].participantIds`}>
      <legend>Present only under this variant</legend>
      {participants.length === 0 ? <span className={styles.hint}>The reaction has no participants yet.</span> : null}
      {participants.map((p, at) => (
        <label key={p.id || at} className={styles.choice}>
          <input type="checkbox" aria-label={`Participant ${at + 1}: only under variant ${n}`} checked={listed.includes(p.id)} disabled={locked !== undefined} onChange={(event) => onEdit(setVariantParticipant(index, p.id, event.target.checked))} />
          {at + 1}. {nameOf(at)} ({wordsOf(p.role).toLowerCase()})
        </label>
      ))}
      <p className={styles.hint}>A participant no variant lists is common to every condition. One listed here takes part only under this variant; it keeps its stage.</p>
      <div className={styles.field}>
        <label htmlFor={`variant-new-role-${index}`}>Add it as</label>
        <select id={`variant-new-role-${index}`} aria-label={`Add it as, variant ${n}`} value={role} disabled={locked !== undefined} onChange={(event) => setRole(event.target.value as ParticipantRoleValue)}>
          {PARTICIPANT_ROLES.map((one) => (
            <option key={one} value={one}>
              {wordsOf(one)}
            </option>
          ))}
        </select>
      </div>
      <RecordPicker
        id={`variant-new-participant-${index}`}
        label={`Find a substance for variant ${n} by name`}
        kinds={['species', 'class', 'reagent']}
        port={picker}
        noun="substance"
        resultsLabel="Substances found"
        unavailable={locked}
        isListed={() => false}
        onPick={(found) => {
          if (found.kind !== 'species' && found.kind !== 'class' && found.kind !== 'reagent') return;
          const added = props.newId('prt');
          onEdit(addParticipant(added, { kind: found.kind, id: found.id }, role));
          onEdit(setVariantParticipant(index, added, true));
          setSaid(`${found.name} was added as ${role.replace(/_/g, ' ')} and is present only under variant ${n}; change its stage in the Participants section.`);
        }}
      />
      <p className={styles.hint} role="status">
        {said}
      </p>
    </fieldset>
  );
}
