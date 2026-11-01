/**
 * The Reagents view (step 7.3c D1-D5): the list of reagents, and one reagent's page. The reagents, their usage and the filters are the core's
 * (`@/core/reagents`); this file draws and edits UI state (the open reagent and the list's filters; saved, never records). A saved reagent that
 * no longer exists is dropped, and said once. No chemistry here.
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { useLayoutMode } from '@/ui/hooks';
import type { ReagentsPorts } from './contracts';
import { ReagentListView } from './reagent-list';
import { ReagentPage } from './reagent-page';
import styles from './reagents-view.module.css';

const GONE_WORDS = 'The reagent you had open is no longer in the data; the list is shown.';

export function ReagentsView(props: { readonly ports: ReagentsPorts }) {
  const { ports } = props;
  const reagentId = useStore(ports.ui.reagents, (s) => s.reagentId);
  const active = useStore(ports.ui.exam, (s) => s.active);
  const phone = useLayoutMode() === 'phone';
  const [version, setVersion] = useState(0);
  const [gone, setGone] = useState(false);
  useEffect(() => ports.store.subscribe(() => setVersion((v) => v + 1)), [ports]);

  // `version` makes a new snapshot when the data moved (the store and the indexes are read, not props)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => ({ state: ports.store.getState(), indexes: ports.indexes.current() }), [ports, version]);
  const { state, indexes } = source;
  const unknown = reagentId !== null && state.records.reagent[reagentId] === undefined;
  useEffect(() => {
    if (!unknown) return;
    ports.ui.reagents.getState().back();
    setGone(true);
    ports.log('reagents_reagent_pruned', 'a saved reagent id names nothing any more; the list is shown');
  }, [unknown, ports]);

  return (
    <section className={styles.view} aria-label="Reagents" data-reagents-view="" data-layout={phone ? 'phone' : 'desktop'}>
      {reagentId === null || unknown ? (
        <>
          {gone ? <p className={styles.notice} role="status">{GONE_WORDS}</p> : null}
          <ReagentListView ports={ports} state={state} indexes={indexes} active={active} phone={phone} />
        </>
      ) : (
        <ReagentPage ports={ports} state={state} indexes={indexes} reagentId={reagentId} active={active} />
      )}
    </section>
  );
}
