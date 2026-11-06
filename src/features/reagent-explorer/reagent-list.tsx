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
import { ListEntries, ListEntry } from '@/ui/primitives/list-entry'; // deep, not the barrel: keeps it out of the first-paint chunk (7.3c A1)
import { useScopeOnly, type ActiveExam } from '@/ui/state';
import { HiddenLine } from '@/ui/study-page';
import { PAGE_SIZE, type ReagentsPorts } from './contracts';
import { Formula } from './formula';
import { countLine, familyWord, mixtureWords, usedWords } from './model';
import styles from './reagents-view.module.css';

export function ReagentListView(props: { readonly ports: ReagentsPorts; readonly state: CanonicalState; readonly indexes: ReadonlyIndexes; readonly active: ActiveExam | null; readonly phone: boolean }) {
  const { ports, state, indexes, active, phone } = props;
  const families = useStore(ports.ui.reagents, (s) => s.families);
  const text = useStore(ports.ui.reagents, (s) => s.text);
  const onlyInScope = useScopeOnly(ports.ui.exam);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [sheet, setSheet] = useState(false);
  const set = ports.ui.reagents.getState();
  const examName = active === null ? undefined : (state.records.exam[active.examId]?.name ?? active.examId);
  const scopeOf = useMemo(() => (active === null ? undefined : createScopeOf(indexes, active.examId, active.examVersionId)), [indexes, active]);
  const list = useMemo(
    () => filterReagents(state, indexes, { text, families, ...(onlyInScope && scopeOf !== undefined ? { outside: (id: string) => scopeOf({ kind: 'reaction', id } as never) === 'outside' } : {}) }),
    [state, indexes, text, families, onlyInScope, scopeOf],
  );
  // how many reagents "Only <exam>" hides: the same list without the scope (step 8.3b, B2)
  const unscoped = useMemo(() => (onlyInScope && scopeOf !== undefined ? filterReagents(state, indexes, { text, families }) : list), [state, indexes, text, families, onlyInScope, scopeOf, list]);
  const hidden = onlyInScope && scopeOf !== undefined ? unscoped.rows.length - list.rows.length : 0;
  const chosen = families.length + (text.trim() === '' ? 0 : 1);
  const shown = list.rows.slice(0, limit);
  const controls = (
    <>
      <label className={styles.field}>
        <span>Find by name</span>
        <input type="search" value={text} autoComplete="off" spellCheck={false} onChange={(event) => set.setText(event.target.value)} />
      </label>
      <div className={styles.bar} role="group" aria-label="Reagent family">
        {REAGENT_FAMILIES.filter((family) => list.familyCounts[family] > 0 || families.includes(family)).map((family) => (
          <button key={family} type="button" className={`${styles.chip} ${styles.familyChip}`} aria-pressed={families.includes(family)} onClick={() => set.toggleFamily(family)}>
            {`${familyWord(family)} ${list.familyCounts[family]}`}
          </button>
        ))}
      </div>
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
          <HiddenLine count={hidden} noun={['reagent', 'reagents']} examName={examName} onShow={() => ports.ui.exam.getState().setMode('everything')} />
          {list.rows.length === 0 ? <p className={styles.muted}>No reagent matches these filters.</p> : null}
          <ListEntries label="Reagents">
            {shown.map((row) => (
              <ListEntry
                key={row.id}
                id={row.id}
                dataAttr={{ 'data-reagent-id': row.id }}
                name={row.name}
                onOpen={() => set.open(row.id)}
                formula={row.formula === undefined ? undefined : <Formula formula={row.formula} />}
                chips={row.families.map(familyWord)}
                chipsLabel={`Families of ${row.name}`}
                meta={usedWords(row)}
                notes={[...(row.backing?.kind === 'species' ? [`Species: ${row.backing.name}`] : []), ...(mixtureWords(row.backing) === undefined ? [] : [mixtureWords(row.backing) ?? ''])]}
              />
            ))}
          </ListEntries>
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
