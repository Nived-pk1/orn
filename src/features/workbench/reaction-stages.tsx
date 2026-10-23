/**
 * The reaction editor's Stages section (step 6.3a decisions D3, 4 and 5): an ordered list (add, label, kind, Up / Down, remove). Adding the
 * FIRST stage puts every participant in it and says so ("All 3 participants are now in stage 1"). Removing a stage that participants use asks
 * where to move them (another stage) or cancels; a stage a condition variant or an intermediate names is refused in words (those are edited
 * in step 6.4's variants editor). Each stage shows ONE summary line of its conditions (the arrow's own builder) and opens the conditions form (step 6.4a D1). Text only; the recipes and the core decide.
 */
import { useState } from 'react';
import { STAGE_KINDS } from '@/core/schema';
import { Button } from '@/ui/primitives';
import { ConditionFields } from './condition-fields';
import { parametersOf, stageLoc, summaryOf } from './condition-model';
import { participantsViewOf } from './participant-model';
import { wordsOf } from './reagent-model';
import { addStage, moveStage, removeStage, setStageKind, setStageLabel, stagesViewOf, stageUseOf, type StageKindValue } from './stage-model';
import type { RecordPickerPort } from './record-picker-contracts';
import type { SectionProps } from './section-props';
import conditionStyles from './condition.module.css';
import styles from './editor.module.css';
import own from './participant.module.css';

export interface StagesSectionProps extends SectionProps {
  /** A fresh stage ID ('stg_...'). */
  readonly newId: (prefix: string) => string;
  readonly picker?: RecordPickerPort | undefined;
}

const plural = (count: number, one: string): string => `${count} ${one}${count === 1 ? '' : 's'}`;
const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

export function StagesSection(props: StagesSectionProps) {
  const stages = stagesViewOf(props.draft);
  const participants = participantsViewOf(props.draft);
  const { onEdit } = props;
  const locked = props.unavailable;
  const [kind, setKind] = useState<StageKindValue>('reaction');
  const [said, setSaid] = useState('');
  /** The stage whose conditions are open (one at a time, by ID): the others show their one summary line. */
  const [openStage, setOpenStage] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ readonly index: number; readonly to: number } | null>(null);
  const nameOf = (id: string): string => {
    const found = participants.find((p) => p.id === id);
    return found?.substance === undefined ? id : (props.picker?.describe(found.substance.kind, found.substance.id)?.name ?? found.substance.id);
  };
  const removeNow = (index: number, to?: number): void => {
    onEdit(removeStage(index, to));
    setAsking(null);
    const left = stages.length - 1;
    setSaid(left === 0 ? 'The only stage was removed: the participants are now in no stage.' : to === undefined ? `Stage ${index + 1} was removed.` : `Stage ${index + 1} was removed; its participants moved to stage ${to > index ? to : to + 1}.`);
  };
  return (
    <div>
      {stages.length === 0 ? <p className={styles.hint}>No stages: every participant is common. Add stages when the reaction has steps in order (for example 1. CH3MgBr, dry ether; 2. H3O+ work-up).</p> : null}
      <ul className={styles.list} aria-label="Stages" data-field-path="stages">
        {stages.map((stage, index) => {
          const n = index + 1;
          const base = `stages[${index}]`;
          const use = stageUseOf(props.draft, stage.id);
          const reason = use === undefined ? undefined : `Stage ${n} is used by the ${use.by === 'condition' ? `condition '${use.label}'` : use.label}; change that in step 6.4's editor first.`;
          const off = (action: () => void, why?: string) => (locked !== undefined ? { unavailable: locked } : why !== undefined ? { unavailable: why } : { onClick: action });
          const others = stages.flatMap((_, at) => (at === index ? [] : [at]));
          const ask = asking?.index === index ? asking : null;
          return (
            <li key={stage.id || index} className={`${styles.panel} ${props.phone === true ? own.participantPhone : own.participant}`} data-testid="stage-row">
              <div role="group" aria-label={`Stage ${n}`} className={own.participantBody}>
              <div className={own.participantHead}>
                <strong>Stage {n}</strong>
                <div className={own.participantActions}>
                  <Button aria-label={`Move stage ${n} up`} {...off(() => onEdit(moveStage(index, -1)), index === 0 ? 'it is first' : undefined)}>
                    Up
                  </Button>
                  <Button aria-label={`Move stage ${n} down`} {...off(() => onEdit(moveStage(index, 1)), index === stages.length - 1 ? 'it is last' : undefined)}>
                    Down
                  </Button>
                  <Button
                    aria-label={`Remove stage ${n}`}
                    {...off(() => (stage.participantIds.length === 0 ? removeNow(index) : setAsking({ index, to: others[0] ?? -1 })), reason)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              {reason === undefined ? null : <p className={styles.hint}>{reason}</p>}
              <div className={own.participantGrid}>
                <div className={styles.field}>
                  <label htmlFor={`stage-label-${index}`}>Label (optional)</label>
                  <input id={`stage-label-${index}`} type="text" aria-label={`Label of stage ${n}`} value={stage.label} readOnly={locked !== undefined} aria-invalid={bad(props, `${base}.label`)} data-field-path={`${base}.label`} autoComplete="off" onChange={(event) => onEdit(setStageLabel(index, event.target.value), `${base}.label`)} />
                </div>
                <div className={styles.field}>
                  <label htmlFor={`stage-kind-${index}`}>Kind</label>
                  <select id={`stage-kind-${index}`} aria-label={`Kind of stage ${n}`} value={stage.kind} disabled={locked !== undefined} aria-invalid={bad(props, `${base}.kind`)} data-field-path={`${base}.kind`} onChange={(event) => onEdit(setStageKind(index, event.target.value))}>
                    {STAGE_KINDS.includes(stage.kind as StageKindValue) ? null : <option value={stage.kind}>{stage.kind === '' ? 'Choose a kind' : stage.kind}</option>}
                    {STAGE_KINDS.map((one) => (
                      <option key={one} value={one}>
                        {wordsOf(one)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p>
                {stage.participantIds.length === 0 ? 'No participants in this stage.' : `${plural(stage.participantIds.length, 'participant')}: ${stage.participantIds.map(nameOf).join(', ')}.`}
              </p>
              <div className={own.participantHead}>
                <span className={conditionStyles.summary} data-testid="stage-conditions">
                  Conditions: {summaryOf(parametersOf(props.draft, stageLoc(index)))}
                </span>
                <Button aria-label={`${openStage === stage.id ? 'Close' : 'Edit'} conditions of stage ${n}`} aria-expanded={openStage === stage.id} data-field-path={`${base}.parameters`} data-open-row="" onClick={() => setOpenStage(openStage === stage.id ? null : stage.id)}>
                  {openStage === stage.id ? 'Close' : 'Edit conditions'}
                </Button>
              </div>
              {openStage === stage.id ? <ConditionFields draft={props.draft} onEdit={onEdit} loc={stageLoc(index)} who={`stage ${n}`} {...(props.invalid === undefined ? {} : { invalid: props.invalid })} {...(locked === undefined ? {} : { unavailable: locked })} {...(props.phone === undefined ? {} : { phone: props.phone })} /> : null}
              {ask !== null ? (
                <div className={styles.confirm} role="group" aria-label={`Remove stage ${n}?`}>
                  {others.length === 0 ? (
                    <span>It is the only stage: its {plural(stage.participantIds.length, 'participant')} will be in no stage (a reaction with no stages is valid).</span>
                  ) : (
                    <>
                      <label htmlFor={`stage-move-${index}`}>Stage {n} has {plural(stage.participantIds.length, 'participant')}. Move them to</label>
                      <select id={`stage-move-${index}`} value={String(ask.to)} onChange={(event) => setAsking({ index, to: Number(event.target.value) })}>
                        {others.map((at) => (
                          <option key={at} value={String(at)}>
                            Stage {at + 1}
                            {stages[at]?.label === '' ? '' : `: ${stages[at]?.label}`}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <Button variant="primary" onClick={() => removeNow(index, others.length === 0 ? undefined : ask.to)}>
                    {others.length === 0 ? 'Remove the stage' : 'Move them and remove the stage'}
                  </Button>
                  <Button onClick={() => setAsking(null)}>Cancel</Button>
                </div>
              ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className={styles.field}>
        <label htmlFor="new-stage-kind">Add a stage of kind</label>
        <select id="new-stage-kind" value={kind} disabled={locked !== undefined} onChange={(event) => setKind(event.target.value as StageKindValue)}>
          {STAGE_KINDS.map((one) => (
            <option key={one} value={one}>
              {wordsOf(one)}
            </option>
          ))}
        </select>
      </div>
      <Button
        {...(locked !== undefined
          ? { unavailable: locked }
          : {
              onClick: () => {
                onEdit(addStage(props.newId('stg'), kind));
                setSaid(stages.length === 0 && participants.length > 0 ? `All ${participants.length} ${participants.length === 1 ? 'participant is' : 'participants are'} now in stage 1.` : `Stage ${stages.length + 1} was added; it has no participants yet. Move participants into it from their rows.`);
              },
            })}
      >
        Add stage
      </Button>
      <p className={styles.hint} role="status">
        {said}
      </p>
    </div>
  );
}
