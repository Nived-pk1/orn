/**
 * The list of reagents (step 7.3c D1): a header with the count line and "Clear all filters", the filters (name box, reagent family with
 * counts, "Only <exam version>" when a scope is set; on a phone behind "Filters (n)"), then the rows, 30 at a time. Every state has words.
 */
import { useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { filterReagents } from '@/core/reagents';
import { createScopeOf } from '@/core/graph';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import { REAGENT_FAMILIES, type CanonicalState } from '@/core/schema';
import { Button, Dialog } from '@/ui/primitives';
import type { ActiveExam } from '@/ui/state';
import { PAGE_SIZE, type ReagentsPorts } from './contracts';
import { Formula } from './formula';
import { countLine, familyWord, mixtureWords, usedWords } from './model';
import styles from './reagents-view.module.css';

export function ReagentListView(props: { readonly ports: ReagentsPorts; readonly state: CanonicalState; readonly indexes: ReadonlyIndexes; readonly active: ActiveExam | null; readonly phone: boolean }) {
  const { ports, state, indexes, active, phone } = props;
  const families = useStore(ports.ui.reagents, (s) => s.families);
  const text = useStore(ports.ui.reagents, (s) => s.text);
  const onlyInScope = useStore(ports.ui.reagents, (s) => s.onlyInScope);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [sheet, setSheet] = useState(false);
  const set = ports.ui.reagents.getState();
  const versionName = active === null ? undefined : (state.records.exam_version[active.examVersionId]?.label ?? active.examVersionId);
  const scopeOf = useMemo(() => (active === null ? undefined : createScopeOf(indexes, active.examId, active.examVersionId)), [indexes, active]);
  const list = useMemo(
    () => filterReagents(state, indexes, { text, families, ...(onlyInScope && scopeOf !== undefined ? { outside: (id: string) => scopeOf({ kind: 'reaction', id } as never) === 'outside' } : {}) }),
    [state, indexes, text, families, onlyInScope, scopeOf],
  );
  const chosen = families.length + (text.trim() === '' ? 0 : 1) + (onlyInScope ? 1 : 0);
  const shown = list.rows.slice(0, limit);
  const controls = (
    <>
      <label className={styles.field}>
        <span>Find by name</span>
        <input type="search" value={text} autoComplete="off" spellCheck={false} onChange={(event) => set.setText(event.target.value)} />
      </label>
      <div className={styles.bar} role="group" aria-label="Reagent family">
        {REAGENT_FAMILIES.map((family) => (
          <button key={family} type="button" className={`${styles.chip} ${styles.familyChip}`} aria-pressed={families.includes(family)} onClick={() => set.toggleFamily(family)}>
            {`${familyWord(family)} ${list.familyCounts[family]}`}
          </button>
        ))}
      </div>
      {versionName === undefined ? null : (
        <label className={styles.option}>
          <input type="checkbox" checked={onlyInScope} onChange={(event) => set.setOnlyInScope(event.target.checked)} />
          <span>{`Only ${versionName}`}</span>
        </label>
      )}
    </>
  );
  return (
    <>
      <header className={styles.header}>
        <h2 className={styles.title}>Reagents</h2>
        <p className={styles.muted}>{countLine(list.rows.length, list.total)}</p>
        {chosen === 0 ? null : (
          <button type="button" onClick={() => set.clearFilters()}>
            Clear all filters
          </button>
        )}
      </header>
      {list.total === 0 ? (
        <p className={styles.muted}>There are no reagents in the data yet.</p>
      ) : (
        <>
          {phone ? (
            <button type="button" aria-haspopup="dialog" onClick={() => setSheet(true)}>{`Filters (${chosen})`}</button>
          ) : (
            <div className={styles.filters} role="group" aria-label="Filters">
              {controls}
            </div>
          )}
          {phone && sheet ? (
            <Dialog open onClose={() => setSheet(false)} title="Filters" size="screen" footer={<Button variant="primary" onClick={() => setSheet(false)}>{`Show ${list.rows.length} ${list.rows.length === 1 ? 'reagent' : 'reagents'}`}</Button>}>
              <div className={styles.sheet}>{controls}</div>
            </Dialog>
          ) : null}
          {list.rows.length === 0 ? <p className={styles.muted}>No reagent matches these filters.</p> : null}
          <ul className={styles.list} aria-label="Reagents">
            {shown.map((row) => (
              <li key={row.id} className={styles.row} data-reagent-id={row.id}>
                <button type="button" className={styles.rowName} onClick={() => set.open(row.id)}>
                  {row.name}
                </button>
                {row.formula === undefined ? null : (
                  <p className={styles.formula}>
                    <Formula formula={row.formula} />
                  </p>
                )}
                {row.backing?.kind === 'species' ? <p className={styles.muted}>{`Species: ${row.backing.name}`}</p> : null}
                {mixtureWords(row.backing) === undefined ? null : <p className={styles.muted}>{mixtureWords(row.backing)}</p>}
                {row.families.length === 0 ? null : (
                  <ul className={styles.chips} aria-label={`Families of ${row.name}`}>
                    {row.families.map((family) => (
                      <li key={family} className={styles.chip}>
                        {familyWord(family)}
                      </li>
                    ))}
                  </ul>
                )}
                <p className={styles.muted}>{usedWords(row)}</p>
              </li>
            ))}
          </ul>
          {list.rows.length > shown.length ? (
            <div className={styles.more}>
              <p className={styles.muted} role="status">{`Showing ${shown.length} of ${list.rows.length} reagents`}</p>
              <button type="button" onClick={() => setLimit((n) => n + PAGE_SIZE)}>{`Show ${PAGE_SIZE} more`}</button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
