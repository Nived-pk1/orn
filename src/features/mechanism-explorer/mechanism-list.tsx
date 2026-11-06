/**
 * The list of mechanisms (step 7.4 E): the shared list shell (count line, name box, "Only <exam version>", 30 at a time), one entry per record
 * (name, aliases, classes as words, "n reactions · n steps"), and in Studio the records with nothing written in one quiet line at the end.
 */
import { useMemo } from 'react';
import { useStore } from 'zustand';
import { filterMechanisms } from '@/core/mechanisms';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState } from '@/core/schema';
import { ListEntries, ListEntry } from '@/ui/primitives/list-entry'; // deep, not the barrel (7.3c A1)
import { useScopeOnly, type ActiveExam } from '@/ui/state';
import { ListShell, useScopeLens } from '@/ui/study-page';
import type { MechanismPorts } from './contracts';
import { alsoCalledWords, usedWords } from './model';

export function MechanismList(props: { readonly ports: MechanismPorts; readonly state: CanonicalState; readonly indexes: ReadonlyIndexes; readonly active: ActiveExam | null; readonly phone: boolean }) {
  const { ports, state, indexes, active, phone } = props;
  const text = useStore(ports.ui.mechanisms, (s) => s.text);
  const only = useScopeOnly(ports.ui.exam);
  const set = ports.ui.mechanisms.getState();
  const lens = useScopeLens(state, indexes, active, only);
  const list = useMemo(() => filterMechanisms(state, indexes, { text, ...(lens.outside === undefined ? {} : { outside: lens.outside }) }), [state, indexes, text, lens.outside]);
  // how many entries "Only <exam>" hides: the same list without the scope
  const unscoped = useMemo(() => (lens.outside === undefined ? list : filterMechanisms(state, indexes, { text })), [state, indexes, text, lens.outside, list]);
  const hidden = lens.outside === undefined ? 0 : unscoped.rows.length - list.rows.length;
  const studio = ports.edit !== undefined;
  return (
    <ListShell
      title="Mechanisms"
      noun={['mechanism', 'mechanisms']}
      listLabel="Mechanisms"
      total={list.total}
      shown={list.rows.length}
      count={list.rows.length}
      text={text}
      onText={set.setText}
      {...(hidden > 0 ? { hidden: { count: hidden, examName: lens.examName, onShow: () => ports.ui.exam.getState().setMode('everything') } } : {})}
      onClear={set.clearFilters}
      phone={phone}
      {...(studio ? { unwritten: list.empty.map((row) => row.name) } : {})}
      renderEntries={(limit) => (
        <ListEntries label="Mechanisms">
          {list.rows.slice(0, limit).map((row) => (
            <ListEntry
              key={row.id}
              id={row.id}
              dataAttr={{ 'data-mechanism-id': row.id }}
              name={row.name}
              onOpen={() => set.open(row.id)}
              chips={row.classes}
              chipsLabel={`Classes of ${row.name}`}
              meta={usedWords(row)}
              notes={[alsoCalledWords(row.aliases)].filter((line): line is string => line !== undefined)}
            />
          ))}
        </ListEntries>
      )}
    />
  );
}
