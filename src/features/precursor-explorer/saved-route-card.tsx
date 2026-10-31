/**
 * A stored route drawn on its own (step 7.3b D3): the same card the Precursors view draws for a saved route (its name, "n steps", the
 * numbered steps in the 7.2b layout), asked for by id. Read-only. The Chapters view gets this through the app (features never import each other).
 */
import { useEffect, useMemo, useState } from 'react';
import type { Route } from '@/core/schema';
import type { PrecursorPorts } from './contracts';
import { savedRouteView } from './model';
import { RouteCard } from './route-card';
import styles from './precursors-view.module.css';

const unscoped = (): 'unmapped' => 'unmapped';

export function SavedRouteCard(props: { readonly routeId: string; readonly ports: Pick<PrecursorPorts, 'store' | 'indexes' | 'select' | 'renderCard'>; readonly selected: string | null }) {
  const { ports, routeId } = props;
  const [version, setVersion] = useState(0);
  useEffect(() => ports.store.subscribe(() => setVersion((v) => v + 1)), [ports]);
  const view = useMemo(() => {
    const route = ports.store.getState().records.route[routeId as never] as Route | undefined;
    return route === undefined ? undefined : savedRouteView(route, { state: ports.store.getState(), indexes: ports.indexes.current(), scopeOf: unscoped });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` re-makes the view when the data moved
  }, [ports, routeId, version]);
  if (view === undefined) return <p className={styles.muted}>This route is not in the dataset.</p>;
  return (
    <ul className={styles.routes} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      <RouteCard route={view} ports={ports} selected={props.selected} />
    </ul>
  );
}
