/**
 * The choices the preview holds as decisions (a legacy file: each hub is imported as a class by default, or as a species). Each is a
 * native select with its question as the name; a change is a revise of the full request. Nothing is guessed: the default is shown.
 */
import type { ImportPlan } from '@/io';
import { ListBox } from './list-box';
import type { PlanChange } from './plan-request';
import { shownMessage } from './words';
import styles from './import.module.css';

export function DecisionsSection(props: { readonly plan: ImportPlan; readonly busy: boolean; readonly onChange: (change: PlanChange) => void }) {
  const { decisions } = props.plan.preview;
  if (decisions.length === 0) return null;
  return (
    <section className={styles.section} aria-label="Decisions">
      <h3>Decisions for you ({decisions.length})</h3>
      <p className={styles.muted}>Each hub is imported as a class by default; you can choose a species for it instead. Nothing is guessed.</p>
      <ListBox
        label="Decisions"
        items={decisions}
        itemKey={(d) => d.id}
        rowHeight={48}
        render={(d) => (
          <div className={styles.row}>
            <span className={styles.rowText}>{shownMessage(d.question)}</span>
            <select
              className={styles.select}
              aria-label={`Decision: ${shownMessage(d.question)}`}
              value={d.chosen}
              disabled={props.busy}
              onChange={(event) => props.onChange({ type: 'decide', id: d.id, chosen: event.currentTarget.value })}
            >
              {d.options.map((option) => (
                <option key={option} value={option}>
                  {shownMessage(option)}
                </option>
              ))}
            </select>
          </div>
        )}
      />
    </section>
  );
}
