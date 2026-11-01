/**
 * The Mechanisms view (step 7.4 E): the list of mechanisms, and one mechanism's page. The records, their counts and the filters are the core's
 * (`@/core/mechanisms`); this file draws and edits UI state (the open record and the list's filters; saved, never records). A saved record that no
 * longer exists is dropped, and said once. No chemistry here.
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { useLayoutMode } from '@/ui/hooks';
import { studyPageStyles as styles } from '@/ui/study-page';
import type { MechanismPorts } from './contracts';
import { MechanismList } from './mechanism-list';
import { MechanismPage } from './mechanism-page';

const GONE_WORDS = 'The mechanism you had open is no longer in the data; the list is shown.';

export function MechanismsView(props: { readonly ports: MechanismPorts }) {
  const { ports } = props;
  const openId = useStore(ports.ui.mechanisms, (s) => s.openId);
  const active = useStore(ports.ui.exam, (s) => s.active);
  const phone = useLayoutMode() === 'phone';
  const [version, setVersion] = useState(0);
  const [gone, setGone] = useState(false);
  useEffect(() => ports.store.subscribe(() => setVersion((v) => v + 1)), [ports]);

  // `version` makes a new snapshot when the data moved (the store and the indexes are read, not props)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => ({ state: ports.store.getState(), indexes: ports.indexes.current() }), [ports, version]);
  const { state, indexes } = source;
  const unknown = openId !== null && (state.records.mechanism as Readonly<Record<string, unknown>>)[openId] === undefined;
  useEffect(() => {
    if (!unknown) return;
    ports.ui.mechanisms.getState().back();
    setGone(true);
    ports.log('mechanisms_mechanism_pruned', 'a saved mechanism id names nothing any more; the list is shown');
  }, [unknown, ports]);

  return (
    <section className={styles.view} aria-label="Mechanisms" data-mechanisms-view="" data-layout={phone ? 'phone' : 'desktop'}>
      {openId === null || unknown ? (
        <>
          {gone ? <p className={styles.notice} role="status">{GONE_WORDS}</p> : null}
          <MechanismList ports={ports} state={state} indexes={indexes} active={active} phone={phone} />
        </>
      ) : (
        <MechanismPage ports={ports} state={state} indexes={indexes} id={openId} active={active} />
      )}
    </section>
  );
}
