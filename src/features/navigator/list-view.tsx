/**
 * The List view of the overview (step 5.7, item j; UI_ARCHITECTURE section 11): the SAME projection as the map, as two accessible,
 * virtualised tables: the families (name, group, reactions out, reactions in) and the arrows (from, to, number of reactions), each
 * sortable by name and by count. A row opens the inspector (click or Space); Enter on a family row opens its page, and so does a
 * double click; Enter on an arrow row opens the inspector. It reads the Scene, so it can never show more or less than the map.
 */
import { useMemo, useState } from 'react';
import type { Scene } from '@/render/scene';
import { VirtualTable, type TableColumn } from '@/ui/primitives';
import type { NavigatorUiStores } from '@/ui/state';
import { arrowValue, familyValue, listRowsOf, nextSort, sortRows, type ArrowRow, type FamilyRow, type Sort } from './list-rows';
import styles from './navigator.module.css';

const FAMILY_COLUMNS: readonly TableColumn<FamilyRow>[] = [
  { id: 'name', header: 'Family', width: '2fr', sortable: true, cell: (row) => row.name },
  { id: 'group', header: 'Group', width: '2fr', sortable: true, cell: (row) => (row.group === '' ? 'No group' : row.group) },
  { id: 'out', header: 'Reactions out', width: '9rem', sortable: true, numeric: true, cell: (row) => row.out },
  { id: 'in', header: 'Reactions in', width: '9rem', sortable: true, numeric: true, cell: (row) => row.in },
];

const ARROW_COLUMNS: readonly TableColumn<ArrowRow>[] = [
  { id: 'from', header: 'From', width: '2fr', sortable: true, cell: (row) => row.from },
  { id: 'to', header: 'To', width: '2fr', sortable: true, cell: (row) => row.to },
  { id: 'reactions', header: 'Reactions', width: '9rem', sortable: true, numeric: true, cell: (row) => row.reactions },
];

export function ListView(props: { readonly scene: Scene; readonly ui: NavigatorUiStores; readonly isHub: (id: string) => boolean }) {
  const { scene, ui, isHub } = props;
  const rows = useMemo(() => listRowsOf(scene), [scene]);
  const [familySort, setFamilySort] = useState<Sort | null>(null);
  const [arrowSort, setArrowSort] = useState<Sort | null>(null);
  const families = useMemo(() => sortRows(rows.families, familySort, familyValue), [rows, familySort]);
  const arrows = useMemo(() => sortRows(rows.arrows, arrowSort, arrowValue), [rows, arrowSort]);
  const inspect = (hit: { readonly kind: 'node' | 'edge'; readonly id: string }): void => {
    ui.selection.getState().select(hit);
    ui.selection.getState().reveal();
  };
  return (
    <div className={styles.listView} data-view="list">
      <section className={styles.listSection} aria-labelledby="list-families">
        <h2 id="list-families" className={styles.listHeading}>
          Families ({families.length})
        </h2>
        <p className={styles.listNote}>Click or Space shows a family in the inspector; Enter or a double click opens its page.</p>
        <VirtualTable
          label="Families"
          columns={FAMILY_COLUMNS}
          rows={families}
          rowKey={(row) => row.id}
          rowLabel={(row) => row.label}
          sort={familySort}
          onSort={(column) => setFamilySort((now) => nextSort(now, column))}
          onRowOpen={(row) => inspect({ kind: 'node', id: row.id })}
          onRowEnter={(row) => (isHub(row.id) ? ui.family.getState().openFamily(row.id) : inspect({ kind: 'node', id: row.id }))}
          onRowDouble={(row) => isHub(row.id) && ui.family.getState().openFamily(row.id)}
        />
      </section>
      <section className={styles.listSection} aria-labelledby="list-arrows">
        <h2 id="list-arrows" className={styles.listHeading}>
          Arrows ({arrows.length})
        </h2>
        <p className={styles.listNote}>Click, Space or Enter shows an arrow in the inspector.</p>
        <VirtualTable
          label="Arrows"
          columns={ARROW_COLUMNS}
          rows={arrows}
          rowKey={(row) => row.id}
          rowLabel={(row) => row.label}
          sort={arrowSort}
          onSort={(column) => setArrowSort((now) => nextSort(now, column))}
          onRowOpen={(row) => inspect({ kind: 'edge', id: row.id })}
        />
      </section>
    </div>
  );
}
