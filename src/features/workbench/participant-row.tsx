/**
 * One participant of the reaction editor (step 6.3b decision D1): a SUMMARY LINE ("2. Ethanol · Reactant · ×2 · aq · Concentrated", a part
 * that is not stated is left out) with Edit, Up, Down and Remove. "Edit" expands the row to its fields (`participant-fields.tsx`); the
 * section keeps at most one row open. A row with a finding shows a marker on its summary line, and a finding that names one of its fields
 * (`data-open-row` on the Edit button) opens it. A desktop row is a panel, a phone row one stacked card. Text only; the draft and the core decide.
 */
import { Button } from '@/ui/primitives';
import { ParticipantFields } from './participant-fields';
import { moveParticipant, removeParticipant, variantUsing, type ParticipantView, type StageSummary } from './participant-model';
import { summaryLineOf } from './participant-summary';
import { SlotPicker } from './slot-picker';
import { fillParticipantSlot } from './slot-model';
import type { RecordPickerPort } from './record-picker-contracts';
import type { SectionProps } from './section-props';
import { SummaryLine } from './summary-line';
import styles from './editor.module.css';
import own from './participant.module.css';

export interface ParticipantRowProps extends SectionProps {
  readonly index: number;
  readonly count: number;
  readonly participant: ParticipantView;
  readonly stages: readonly StageSummary[];
  readonly picker?: RecordPickerPort | undefined;
  /** The row shows its fields. */
  readonly open: boolean;
  /** Edit / Close: the section opens this row (and closes the one that was open) or closes it. */
  readonly onToggle: () => void;
}

/** True when some finding names this participant or one of its fields. */
const hasFinding = (invalid: ReadonlySet<string> | undefined, base: string): boolean => [...(invalid ?? [])].some((path) => path === base || path.startsWith(`${base}.`) || path.startsWith(`${base}[`));

export function ParticipantRow(props: ParticipantRowProps) {
  const { participant: p, index, onEdit, picker, open } = props;
  const locked = props.unavailable;
  const n = index + 1;
  const base = `participants[${index}]`;
  const choice = p.substance === undefined ? undefined : picker?.describe(p.substance.kind, p.substance.id);
  const usedBy = variantUsing(props.draft, p.id);
  const removeReason = usedBy === undefined ? undefined : `Participant ${n} is used by the condition '${usedBy}'; change that in step 6.4's editor first.`;
  const off = (action: () => void, reason?: string) => (locked !== undefined ? { unavailable: locked } : reason !== undefined ? { unavailable: reason } : { onClick: action });
  return (
    <li className={props.phone === true ? `${styles.panel} ${own.participantPhone}` : `${styles.panel} ${own.participant}`} data-testid="participant-row" data-open={open ? '' : undefined}>
      <div role="group" aria-label={`Participant ${n}`} className={own.participantBody}>
        <div className={own.participantHead}>
          <span className={own.participantSummary} aria-invalid={hasFinding(props.invalid, base) ? true : undefined}>
            <SummaryLine text={summaryLineOf(n, p.substance === undefined ? undefined : (choice?.name ?? p.substance.id), p)} />
          </span>
          {!open && hasFinding(props.invalid, base) ? (
            <Button className={own.participantMarker} aria-label={`Participant ${n} has a finding: open it`} onClick={props.onToggle}>
              Finding
            </Button>
          ) : null}
          <div className={own.participantActions}>
            <Button aria-label={`${open ? 'Close' : 'Edit'} participant ${n}`} aria-expanded={open} data-field-path={base} data-open-row="" onClick={props.onToggle}>
              {open ? 'Close' : 'Edit'}
            </Button>
            <Button aria-label={`Move participant ${n} up`} {...off(() => onEdit(moveParticipant(index, -1)), index === 0 ? 'it is first' : undefined)}>
              Up
            </Button>
            <Button aria-label={`Move participant ${n} down`} {...off(() => onEdit(moveParticipant(index, 1)), index === props.count - 1 ? 'it is last' : undefined)}>
              Down
            </Button>
            <Button aria-label={`Remove participant ${n}`} {...off(() => onEdit(removeParticipant(index)), removeReason)}>
              Remove
            </Button>
          </div>
        </div>
        {removeReason === undefined ? null : <p className={styles.hint}>{removeReason}</p>}
        {p.slotClassId === undefined ? null : <SlotPicker id={`slot-participant-${index}`} classId={p.slotClassId} picker={picker} unavailable={locked} fill={(speciesId) => fillParticipantSlot(index, speciesId)} onEdit={onEdit} />}
        {open ? <ParticipantFields {...props} /> : null}
      </div>
    </li>
  );
}
