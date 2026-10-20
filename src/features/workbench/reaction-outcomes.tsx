/**
 * The reaction editor's Outcomes section (step 6.4b decision D1 and D2): the outcomes in the card's groups (by condition-variant set, the outcome
 * groups rule and order), each ONE summary line ("1. exclusive · Propanal · under all conditions") with Edit, Up, Down and Remove (Remove asks);
 * one outcome open at a time and a new one opens. A finding that names an outcome (RXN-003, RXN-008, RXN-009, the schema) marks its line and
 * opens it from "Finding". Up / Down move the outcome in the STORED order; the groups are how it is shown. Text only; the recipes decide.
 */
import { useState } from 'react';
import { groupOutcomes } from '@/core/graph';
import { Button } from '@/ui/primitives';
import { OutcomeFields } from './outcome-fields';
import { addOutcome, moveOutcome, removeOutcome, type ProductKind } from './outcome-model';
import { holdsUnderWords, outcomeSummary, outcomesViewOf, type OutcomeView } from './outcome-view';
import { OutcomeProducts } from './outcome-products';
import type { RecordPickerPort } from './record-picker-contracts';
import type { SectionProps } from './section-props';
import styles from './editor.module.css';
import own from './participant.module.css';
import outcomeStyles from './outcome.module.css';

export interface OutcomesSectionProps extends SectionProps {
  readonly picker?: RecordPickerPort | undefined;
  /** A fresh outcome or product ID ('out_...', 'pdt_...'). */
  readonly newId: (prefix: string) => string;
}

/** True when some finding names this outcome or one of its fields. */
const hasFinding = (invalid: ReadonlySet<string> | undefined, base: string): boolean =>
  [...(invalid ?? [])].some((path) => path === base || path.startsWith(`${base}.`) || path.startsWith(`${base}[`));
const plural = (count: number, one: string): string => `${count} ${one}${count === 1 ? '' : 's'}`;

interface Placed extends OutcomeView {
  readonly at: number;
  readonly conditionVariantIds: readonly string[];
}

export function OutcomesSection(props: OutcomesSectionProps) {
  const outcomes = outcomesViewOf(props.draft);
  const { onEdit, picker } = props;
  const locked = props.unavailable;
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const [asking, setAsking] = useState<number | null>(null);
  const [said, setSaid] = useState('');
  const keyOf = (outcome: OutcomeView, at: number): string => outcome.id || `#${at}`;
  const nameOf = (kind: ProductKind, id: string): string => picker?.describe(kind, id)?.name ?? id;
  const placed: Placed[] = outcomes.map((outcome, at) => ({
    ...outcome,
    at,
    conditionVariantIds: outcome.variantIds,
  }));
  const groups = groupOutcomes(placed);
  const off = (action: () => void, reason?: string) => (locked !== undefined ? { unavailable: locked } : reason !== undefined ? { unavailable: reason } : { onClick: action });
  const removeNow = (at: number): void => {
    const gone = outcomes[at];
    onEdit(removeOutcome(at));
    setAsking(null);
    if (gone !== undefined && openId === keyOf(gone, at)) setOpenId(undefined);
    setSaid(`Outcome ${at + 1} was removed.`);
  };
  return (
    <div>
      {outcomes.length === 0 ? <p className={styles.hint}>No outcomes yet. A reaction needs an outcome with at least one product (RXN-002); add one below.</p> : null}
      <ul className={styles.list} aria-label="Outcomes" data-field-path="outcomes">
        {groups.flatMap((group) => [
          <li key={`group:${group.key}`} className={outcomeStyles.groupItem} data-testid="outcome-group">
            <h4 className={outcomeStyles.groupHeading}>{group.key === '' ? 'All conditions' : `Under ${holdsUnderWords(props.draft, group.conditionVariantIds)}`}</h4>
          </li>,
          ...group.outcomes.map((outcome) => {
            const index = outcome.at;
            const n = index + 1;
            const base = `outcomes[${index}]`;
            const open = openId === keyOf(outcome, index);
            const marked = hasFinding(props.invalid, base);
            const toggle = (): void => setOpenId(open ? undefined : keyOf(outcome, index));
            return (
              <li
                key={outcome.id || index}
                className={props.phone === true ? `${styles.panel} ${own.participantPhone}` : `${styles.panel} ${own.participant}`}
                data-testid="outcome-row"
                data-open={open ? '' : undefined}
              >
                <div role="group" aria-label={`Outcome ${n}`} className={own.participantBody}>
                  <div className={own.participantHead}>
                    <span className={own.participantSummary} data-testid="outcome-summary" aria-invalid={marked ? true : undefined}>
                      {outcomeSummary(props.draft, index, nameOf)}
                    </span>
                    {!open && marked ? (
                      <Button className={own.participantMarker} aria-label={`Outcome ${n} has a finding: open it`} onClick={toggle}>
                        Finding
                      </Button>
                    ) : null}
                    <div className={own.participantActions}>
                      <Button aria-label={`${open ? 'Close' : 'Edit'} outcome ${n}`} aria-expanded={open} data-field-path={base} data-open-row="" onClick={toggle}>
                        {open ? 'Close' : 'Edit'}
                      </Button>
                      <Button aria-label={`Move outcome ${n} up`} {...off(() => onEdit(moveOutcome(index, -1)), index === 0 ? 'it is first' : undefined)}>
                        Up
                      </Button>
                      <Button aria-label={`Move outcome ${n} down`} {...off(() => onEdit(moveOutcome(index, 1)), index === outcomes.length - 1 ? 'it is last' : undefined)}>
                        Down
                      </Button>
                      <Button aria-label={`Remove outcome ${n}`} {...off(() => setAsking(index))}>
                        Remove
                      </Button>
                    </div>
                  </div>
                  {asking === index ? (
                    <div className={styles.confirm} role="group" aria-label={`Remove outcome ${n}?`}>
                      <span>
                        Outcome {n} and its {plural(outcome.products.length, 'product')} are removed from this draft; Undo brings them back.
                      </span>
                      <Button variant="primary" onClick={() => removeNow(index)}>
                        Remove the outcome
                      </Button>
                      <Button onClick={() => setAsking(null)}>Cancel</Button>
                    </div>
                  ) : null}
                  {open ? (
                    <>
                      <OutcomeFields {...props} index={index} outcome={outcome} />
                      <OutcomeProducts {...props} index={index} outcome={outcome} />
                    </>
                  ) : null}
                </div>
              </li>
            );
          }),
        ])}
      </ul>
      <Button
        {...off(() => {
          const id = props.newId('out');
          onEdit(addOutcome(id));
          setOpenId(id);
          setSaid(`Outcome ${outcomes.length + 1} was added: selectivity unspecified, under all conditions. Add its products.`);
        })}
      >
        Add outcome
      </Button>
      <p className={styles.hint} role="status">
        {said}
      </p>
    </div>
  );
}
