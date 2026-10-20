/**
 * The fields of one EXPANDED participant (step 6.3b decision D1): the substance (with "Change substance"), the role with its defaults in
 * words, coefficient, phase, strength and the stage (full width, only when the reaction has stages); then a collapsed "More details" (dry,
 * main substrate, equivalents, amount word, amount as written, the reagent profile, the source wording) and the collapsed "Advanced:
 * override flags". Text only; the draft and the core decide.
 */
import { useState } from 'react';
import { PARTICIPANT_ROLES, PHASES, QUANTITY_QUALIFIERS, STRENGTHS } from '@/core/schema';
import { Button } from '@/ui/primitives';
import { FLAG_LABELS, FLAG_NAMES, defaultOf, roleDefaultsWords } from './participant-words';
import {
  setCoefficient,
  setDry,
  setFlag,
  setParticipantRef,
  setParticipantStage,
  setPhase,
  setPrimary,
  setProfile,
  setQuantityPart,
  setRole,
  setStrength,
  type FlagChoice,
  type FlagName,
  type ParticipantView,
  type StageSummary,
} from './participant-model';
import { RecordPicker, choiceLine } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import { wordsOf } from './reagent-model';
import type { SectionProps } from './section-props';
import styles from './editor.module.css';
import own from './participant.module.css';

export interface ParticipantFieldsProps extends SectionProps {
  readonly index: number;
  readonly participant: ParticipantView;
  readonly stages: readonly StageSummary[];
  readonly picker?: RecordPickerPort | undefined;
}

export const stageWords = (stage: StageSummary, index: number): string => `Stage ${index + 1}${stage.label === '' ? '' : `: ${stage.label}`} (${wordsOf(stage.kind).toLowerCase()})`;

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);
const numberOf = (raw: string): number | undefined => (raw === '' || !Number.isFinite(Number(raw)) ? undefined : Number(raw));

export function ParticipantFields(props: ParticipantFieldsProps) {
  const { participant: p, index, onEdit, picker } = props;
  const locked = props.unavailable;
  const [changing, setChanging] = useState(false);
  const n = index + 1;
  const base = `participants[${index}]`;
  const choice = p.substance === undefined ? undefined : picker?.describe(p.substance.kind, p.substance.id);
  const profiles = p.substance?.kind === 'reagent' ? (picker?.profilesOf?.(p.substance.id) ?? []) : [];
  return (
    <div className={own.participantFields}>
      <div className={own.participantSubstance}>
        <strong tabIndex={-1} data-field-path={`${base}.ref`} aria-invalid={bad(props, `${base}.ref`)}>
          {p.substance === undefined ? 'No substance' : choiceLine(choice, p.substance.id)}
        </strong>
        <Button aria-label={`Change substance of participant ${n}`} {...(locked !== undefined ? { unavailable: locked } : { onClick: () => setChanging(!changing) })}>
          {changing ? 'Keep substance' : 'Change substance'}
        </Button>
      </div>
      {changing ? (
        <RecordPicker
          id={`participant-change-${index}`}
          label={`Find the new substance of participant ${n}`}
          kinds={['species', 'class', 'reagent']}
          port={picker}
          noun="substance"
          resultsLabel={`Substances found for participant ${n}`}
          unavailable={locked}
          isListed={(found) => p.substance?.kind === found.kind && p.substance.id === found.id}
          onPick={(found) => {
            if (found.kind !== 'reaction' && found.kind !== 'mechanism') onEdit(setParticipantRef(index, { kind: found.kind, id: found.id }));
            setChanging(false);
          }}
        />
      ) : null}
      <div className={own.participantGrid}>
        <div className={styles.field}>
          <label htmlFor={`p-role-${index}`}>Role</label>
          <select id={`p-role-${index}`} aria-label={`Role of participant ${n}`} value={p.role} disabled={locked !== undefined} aria-invalid={bad(props, `${base}.role`)} data-field-path={`${base}.role`} onChange={(event) => onEdit(setRole(index, event.target.value), `${base}.role`)}>
            {PARTICIPANT_ROLES.includes(p.role as never) ? null : <option value={p.role}>{p.role === '' ? 'Choose a role' : p.role}</option>}
            {PARTICIPANT_ROLES.map((role) => (
              <option key={role} value={role}>
                {wordsOf(role)}
              </option>
            ))}
          </select>
          <span className={styles.hint}>{roleDefaultsWords(p.role)}</span>
        </div>
        <div className={styles.field}>
          <label htmlFor={`p-coef-${index}`}>Coefficient</label>
          <input id={`p-coef-${index}`} type="number" step="any" min="0" aria-label={`Coefficient of participant ${n}`} value={p.coefficient ?? ''} readOnly={locked !== undefined} aria-invalid={bad(props, `${base}.coefficient`)} data-field-path={`${base}.coefficient`} onChange={(event) => onEdit(setCoefficient(index, numberOf(event.target.value)), `${base}.coefficient`)} />
        </div>
        <div className={styles.field}>
          <label htmlFor={`p-phase-${index}`}>Phase</label>
          <select id={`p-phase-${index}`} aria-label={`Phase of participant ${n}`} value={p.phase} disabled={locked !== undefined} aria-invalid={bad(props, `${base}.phase`)} data-field-path={`${base}.phase`} onChange={(event) => onEdit(setPhase(index, event.target.value))}>
            <option value="">Not stated</option>
            {PHASES.map((phase) => (
              <option key={phase} value={phase}>
                {phase}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`p-strength-${index}`}>Strength</label>
          <select id={`p-strength-${index}`} aria-label={`Strength of participant ${n}`} value={p.strength} disabled={locked !== undefined} aria-invalid={bad(props, `${base}.strength`)} data-field-path={`${base}.strength`} onChange={(event) => onEdit(setStrength(index, event.target.value))}>
            <option value="">Not stated</option>
            {STRENGTHS.map((strength) => (
              <option key={strength} value={strength}>
                {wordsOf(strength)}
              </option>
            ))}
          </select>
        </div>
        {props.stages.length === 0 ? null : (
          <div className={`${styles.field} ${own.participantWide}`}>
            <label htmlFor={`p-stage-${index}`}>Stage</label>
            <select id={`p-stage-${index}`} aria-label={`Stage of participant ${n}`} value={String(p.stageIndex)} disabled={locked !== undefined} aria-invalid={bad(props, base)} data-field-path={`${base}.stage`} onChange={(event) => onEdit(setParticipantStage(p.id, Number(event.target.value)))}>
              {p.stageIndex >= 0 ? null : <option value="-1">In no stage</option>}
              {props.stages.map((stage, at) => (
                <option key={stage.id || at} value={String(at)}>
                  {stageWords(stage, at)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <details className={own.advanced}>
        <summary>More details</summary>
        <div className={own.participantGrid}>
          <div className={styles.field}>
            <label className={styles.choice}>
              <input type="checkbox" aria-label={`Dry: participant ${n}`} checked={p.dry} disabled={locked !== undefined} onChange={(event) => onEdit(setDry(index, event.target.checked))} />
              Dry (anhydrous)
            </label>
            <label className={styles.choice}>
              <input type="checkbox" aria-label={`Main substrate: participant ${n}`} checked={p.primary} disabled={locked !== undefined} aria-invalid={bad(props, `${base}.isPrimarySubstrate`)} data-field-path={`${base}.isPrimarySubstrate`} onChange={(event) => onEdit(setPrimary(index, event.target.checked))} />
              Main substrate
            </label>
          </div>
          <div className={styles.field}>
            <label htmlFor={`p-eq-${index}`}>Equivalents</label>
            <input id={`p-eq-${index}`} type="number" step="any" min="0" aria-label={`Equivalents of participant ${n}`} value={p.equivalents ?? ''} readOnly={locked !== undefined} aria-invalid={bad(props, `${base}.quantity.equivalents`)} data-field-path={`${base}.quantity.equivalents`} onChange={(event) => onEdit(setQuantityPart(index, 'equivalents', numberOf(event.target.value)), `${base}.quantity.equivalents`)} />
          </div>
          <div className={styles.field}>
            <label htmlFor={`p-qual-${index}`}>Amount word</label>
            <select id={`p-qual-${index}`} aria-label={`Amount word of participant ${n}`} value={p.qualifier} disabled={locked !== undefined} data-field-path={`${base}.quantity.qualifier`} onChange={(event) => onEdit(setQuantityPart(index, 'qualifier', event.target.value))}>
              <option value="">Not stated</option>
              {QUANTITY_QUALIFIERS.map((word) => (
                <option key={word} value={word}>
                  {wordsOf(word)}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor={`p-qtext-${index}`}>Amount as written</label>
            <input id={`p-qtext-${index}`} type="text" aria-label={`Amount text of participant ${n}`} value={p.quantityText} readOnly={locked !== undefined} aria-invalid={bad(props, `${base}.quantity.text`)} data-field-path={`${base}.quantity.text`} autoComplete="off" onChange={(event) => onEdit(setQuantityPart(index, 'text', event.target.value), `${base}.quantity.text`)} />
          </div>
          {profiles.length === 0 && p.profileId === '' ? null : (
            <div className={styles.field}>
              <label htmlFor={`p-profile-${index}`}>Reagent profile</label>
              <select id={`p-profile-${index}`} aria-label={`Profile of participant ${n}`} value={p.profileId} disabled={locked !== undefined} aria-invalid={bad(props, `${base}.profileId`)} data-field-path={`${base}.profileId`} onChange={(event) => onEdit(setProfile(index, event.target.value))}>
                <option value="">No profile</option>
                {profiles.some((profile) => profile.id === p.profileId) || p.profileId === '' ? null : <option value={p.profileId}>{p.profileId} (not a profile of this reagent)</option>}
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label === '' ? profile.id : profile.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {p.originalText === '' ? null : <p className={styles.hint}>Written in the source as: {p.originalText}</p>}
      </details>
      <details className={own.advanced}>
        <summary>Advanced: override flags</summary>
        <p className={styles.hint}>Leave these on "Default" unless the chemistry needs otherwise (the checks RXN-004 and RXN-005 say when a flag looks wrong).</p>
        {FLAG_NAMES.map((flag: FlagName) => (
          <div className={styles.field} key={flag}>
            <label htmlFor={`p-flag-${flag}-${index}`}>{FLAG_LABELS[flag]}</label>
            <select id={`p-flag-${flag}-${index}`} aria-label={`${FLAG_LABELS[flag]}: participant ${n}`} value={p.flags[flag]} disabled={locked !== undefined} aria-invalid={bad(props, `${base}.flags.${flag}`)} data-field-path={`${base}.flags.${flag}`} onChange={(event) => onEdit(setFlag(index, flag, event.target.value as FlagChoice))}>
              <option value="default">Default ({defaultOf(p.role, flag)})</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        ))}
      </details>
    </div>
  );
}
