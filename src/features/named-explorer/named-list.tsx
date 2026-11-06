/**
 * The list of named reactions (step 7.4 D): the shared list shell (count line, name box, "Only <exam version>", 30 at a time), one entry per
 * record, and in Studio the records with nothing written in one quiet line at the end.
 */
import { useMemo } from 'react';
import { useStore } from 'zustand';
import { filterNamedReactions } from '@/core/named-reactions';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState } from '@/core/schema';
import { ListEntries, ListEntry } from '@/ui/primitives/list-entry'; // deep, not the barrel (7.3c A1)
import { useScopeOnly, type ActiveExam } from '@/ui/state';
import { ListShell, useScopeLens } from '@/ui/study-page';
import type { NamedPorts } from './contracts';
import { alsoCalledWords, partOfWords, usedWords } from './model';

export function NamedList(props: { readonly ports: NamedPorts; readonly state: CanonicalState; readonly indexes: ReadonlyIndexes; readonly active: ActiveExam | null; readonly phone: boolean }) {
  const { ports, state, indexes, active, phone } = props;
  const text = useStore(ports.ui.named, (s) => s.text);
  const only = useScopeOnly(ports.ui.exam);
  const set = ports.ui.named.getState();
  const lens = useScopeLens(state, indexes, active, only);
  const list = useMemo(() => filterNamedReactions(state, indexes, { text, ...(lens.outside === undefined ? {} : { outside: lens.outside }) }), [state, indexes, text, lens.outside]);
  // how many entries "Only <exam>" hides: the same list without the scope
  const unscoped = useMemo(() => (lens.outside === undefined ? list : filterNamedReactions(state, indexes, { text })), [state, indexes, text, lens.outside, list]);
  const hidden = lens.outside === undefined ? 0 : unscoped.rows.length - list.rows.length;
  const studio = ports.edit !== undefined;
  return (
    <ListShell
      title="Named reactions"
      noun={['named reaction', 'named reactions']}
      listLabel="Named reactions"
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
        <ListEntries label="Named reactions">
          {list.rows.slice(0, limit).map((row) => (
            <ListEntry
              key={row.id}
              id={row.id}
              dataAttr={{ 'data-named-id': row.id }}
              name={row.name}
              onOpen={() => set.open(row.id)}
              meta={usedWords(row)}
              notes={[alsoCalledWords(row.aliases), partOfWords(row.parents)].filter((line): line is string => line !== undefined)}
            />
          ))}
        </ListEntries>
      )}
    />
  );
}
