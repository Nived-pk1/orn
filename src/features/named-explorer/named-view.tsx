/**
 * The Named reactions view (step 7.4 D): the list of named reactions, and one named reaction's page. The records, their counts and the filters
 * are the core's (`@/core/named-reactions`); this file draws and edits UI state (the open record and the list's filters; saved, never records).
 * A saved record that no longer exists is dropped, and said once. No chemistry here.
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { useLayoutMode } from '@/ui/hooks';
import { studyPageStyles as styles } from '@/ui/study-page';
import type { NamedPorts } from './contracts';
import { NamedList } from './named-list';
import { NamedPage } from './named-page';

const GONE_WORDS = 'The named reaction you had open is no longer in the data; the list is shown.';

export function NamedView(props: { readonly ports: NamedPorts }) {
  const { ports } = props;
  const openId = useStore(ports.ui.named, (s) => s.openId);
  const active = useStore(ports.ui.exam, (s) => s.active);
  const phone = useLayoutMode() === 'phone';
  const [version, setVersion] = useState(0);
  const [gone, setGone] = useState(false);
  useEffect(() => ports.store.subscribe(() => setVersion((v) => v + 1)), [ports]);

  // `version` makes a new snapshot when the data moved (the store and the indexes are read, not props)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => ({ state: ports.store.getState(), indexes: ports.indexes.current() }), [ports, version]);
  const { state, indexes } = source;
  const unknown = openId !== null && (state.records.named_reaction as Readonly<Record<string, unknown>>)[openId] === undefined;
  useEffect(() => {
    if (!unknown) return;
    ports.ui.named.getState().back();
    setGone(true);
    ports.log('named_reaction_pruned', 'a saved named reaction id names nothing any more; the list is shown');
  }, [unknown, ports]);

  return (
    <section className={styles.view} aria-label="Named reactions" data-named-view="" data-layout={phone ? 'phone' : 'desktop'}>
      {openId === null || unknown ? (
        <>
          {gone ? <p className={styles.notice} role="status">{GONE_WORDS}</p> : null}
          <NamedList ports={ports} state={state} indexes={indexes} active={active} phone={phone} />
        </>
      ) : (
        <NamedPage ports={ports} state={state} indexes={indexes} id={openId} active={active} />
      )}
    </section>
  );
}
