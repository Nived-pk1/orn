/**
 * The reaction editor's Participants section (step 6.3a decision D2; compact rows, step 6.3b D1): one SUMMARY LINE per participant (a card
 * on a phone) of which at most one is expanded, and below them "Add a participant": the role to give it, then a search for the substance
 * (species, class or reagent) through the generic picker. A new participant gets a fresh ID from the editor port, starts in the FIRST stage
 * (said in words) when there are stages, and opens expanded. With no stages the rows show no stage picker. Text only; the recipes and the core decide.
 */
import { useState } from 'react';
import { PARTICIPANT_ROLES } from '@/core/schema';
import { addParticipant, participantsViewOf, stageSummariesOf, type ParticipantRoleValue } from './participant-model';
import { ParticipantRow } from './participant-row';
import { RecordPicker } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import { wordsOf } from './reagent-model';
import type { SectionProps } from './section-props';
import styles from './editor.module.css';

export interface ParticipantsSectionProps extends SectionProps {
  readonly picker?: RecordPickerPort | undefined;
  /** A fresh participant ID ('prt_...'). */
  readonly newId: (prefix: string) => string;
}

export function ParticipantsSection(props: ParticipantsSectionProps) {
  const participants = participantsViewOf(props.draft);
  const stages = stageSummariesOf(props.draft);
  const locked = props.unavailable;
  const [role, setNewRole] = useState<ParticipantRoleValue>('reactant');
  const [said, setSaid] = useState('');
  // the one row that shows its fields: by participant ID (a row without one, by its position)
  const [openKey, setOpenKey] = useState<string | undefined>(undefined);
  const keyOf = (participant: { readonly id: string }, index: number): string => participant.id || `#${index}`;
  return (
    <div>
      {participants.length === 0 ? <p className={styles.hint}>None yet. A reaction needs at least one reactant (RXN-001).</p> : null}
      {stages.length === 0 ? <p className={styles.hint}>This reaction has no stages, so every participant is common. Stages are in the Stages section.</p> : null}
      <ul className={styles.list} aria-label="Participants" data-field-path="participants">
        {participants.map((participant, index) => (
          <ParticipantRow
            key={participant.id || index}
            {...props}
            index={index}
            count={participants.length}
            participant={participant}
            stages={stages}
            open={openKey === keyOf(participant, index)}
            onToggle={() => setOpenKey(openKey === keyOf(participant, index) ? undefined : keyOf(participant, index))}
          />
        ))}
      </ul>
      <h4 className={styles.hint}>Add a participant</h4>
      <div className={styles.field}>
        <label htmlFor="new-participant-role">Add it as</label>
        <select id="new-participant-role" value={role} disabled={locked !== undefined} onChange={(event) => setNewRole(event.target.value as ParticipantRoleValue)}>
          {PARTICIPANT_ROLES.map((one) => (
            <option key={one} value={one}>
              {wordsOf(one)}
            </option>
          ))}
        </select>
      </div>
      <RecordPicker
        id="participant-search"
        label="Find a substance by name"
        kinds={['species', 'class', 'reagent']}
        port={props.picker}
        noun="substance"
        resultsLabel="Substances found"
        unavailable={locked}
        isListed={() => false}
        onPick={(found) => {
          if (found.kind === 'reaction') return;
          const added = props.newId('prt');
          props.onEdit(addParticipant(added, { kind: found.kind, id: found.id }, role));
          setOpenKey(added);
          setSaid(stages.length === 0 ? `${found.name} was added as ${role.replace(/_/g, ' ')}.` : `${found.name} was added as ${role.replace(/_/g, ' ')} in stage 1; change its stage in its row.`);
        }}
      />
      <p className={styles.hint} role="status">
        {said}
      </p>
    </div>
  );
}
