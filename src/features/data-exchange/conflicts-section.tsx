/**
 * Records that exist in both the file and the dataset (merge mode): the identical ones are skipped and counted, the ones that differ
 * get a bulk choice and a choice per record. A choice is a revise of the full request; the controls wait while one is on its way.
 */
import type { IdConflict, ImportPlan } from '@/io';
import { Button } from '@/ui/primitives';
import type { DataExchangePorts } from './contracts';
import { ListBox } from './list-box';
import { CHOICES, choiceLabel, conflictCounts, liveConflicts, type PlanChange } from './plan-request';
import { shownName } from './words';
import styles from './import.module.css';

const CHOICE_WORDS: Readonly<Record<string, string>> = {
  keep_current: 'the records you have stay as they are',
  replace: "the file's version replaces yours (Undo import brings yours back)",
  import_as_copy: "yours stay and the file's version is added as a copy with a new ID",
};

export function ConflictsSection(props: {
  readonly plan: ImportPlan;
  readonly ports: Pick<DataExchangePorts, 'nameOf'>;
  readonly busy: boolean;
  readonly onChange: (change: PlanChange) => void;
}) {
  const { plan, busy } = props;
  const counts = conflictCounts(plan);
  const differing = liveConflicts(plan).filter((conflict) => !conflict.identical);
  if (plan.mode !== 'merge' || counts.identical + counts.differing === 0) return null;
  return (
    <section className={styles.section} aria-label="Records in both">
      <h3>Records in both the file and your data</h3>
      <p>
        {counts.identical} identical (skipped, nothing changes); {counts.differing} differ.
      </p>
      {counts.differing > 0 ? (
        <>
          <p className={styles.muted}>Choose what happens to the ones that differ. Nothing is replaced until you confirm.</p>
          <div className={styles.actions} role="group" aria-label="Choose for all that differ">
            {CHOICES.map((choice) => (
              <Button key={choice.resolution} disabled={busy} onClick={() => props.onChange({ type: 'resolve_all', resolution: choice.resolution })} title={CHOICE_WORDS[choice.resolution] ?? ''}>
                {choice.label} for all {counts.differing}
              </Button>
            ))}
          </div>
          <ListBox
            label="Records that differ"
            items={differing}
            itemKey={(conflict) => `${conflict.ref.kind}:${conflict.ref.id}`}
            rowHeight={44}
            render={(conflict) => <ConflictRow conflict={conflict} name={props.ports.nameOf(conflict.ref)} busy={busy} onChange={props.onChange} />}
          />
        </>
      ) : null}
    </section>
  );
}

function ConflictRow(props: { readonly conflict: IdConflict; readonly name: string | undefined; readonly busy: boolean; readonly onChange: (change: PlanChange) => void }) {
  const { conflict } = props;
  const kind = conflict.ref.kind.replaceAll('_', ' ');
  const label = props.name === undefined ? `${kind} ${conflict.ref.id}` : `${kind} ${shownName(props.name)} (${conflict.ref.id})`;
  return (
    <div className={styles.row}>
      <span className={styles.rowText}>{label}</span>
      <select
        className={styles.select}
        aria-label={`Choice for ${label}`}
        value={conflict.resolution}
        disabled={props.busy}
        onChange={(event) => props.onChange({ type: 'resolve', id: conflict.ref.id, resolution: event.currentTarget.value as IdConflict['resolution'] })}
      >
        {CHOICES.map((choice) => (
          <option key={choice.resolution} value={choice.resolution}>
            {choice.label}
          </option>
        ))}
        {CHOICES.some((c) => c.resolution === conflict.resolution) ? null : <option value={conflict.resolution}>{choiceLabel(conflict.resolution)}</option>}
      </select>
    </div>
  );
}
