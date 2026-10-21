/**
 * The cell grid of the map family editor (step 6.6c part 4): the CURRENT arrangement (every used row and column plus one free row and one
 * free column), each family's label in its cell. A free cell is chosen by click, Enter or Space; the arrow keys move between cells; a
 * cell another family holds is refused in words (PRS-004) and the draft does not change. Without a cell the map draws the family in the row below it.
 */
import { useState } from 'react';
import { Button } from '@/ui/primitives';
import { gridSize, holdersOf, setCell } from './family-model';
import type { DraftRecipe } from '@/core/editing';
import type { MapFamilyChoice } from './record-picker-contracts';
import styles from './editor.module.css';

export interface FamilyGridProps {
  readonly selfId: string;
  readonly families: readonly MapFamilyChoice[];
  readonly chosen: { readonly column: number; readonly row: number } | undefined;
  readonly unavailable?: string | undefined;
  readonly invalid?: boolean | undefined;
  readonly onEdit: (recipe: DraftRecipe, path?: string) => void;
}

export function FamilyGrid(props: FamilyGridProps) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const { columns, rows } = gridSize(props.families, props.chosen);
  const locked = props.unavailable !== undefined;
  const choose = (column: number, row: number): void => {
    const holders = holdersOf(props.families, props.selfId, { column, row });
    if (holders.length > 0) {
      setRefusal(`Column ${column}, row ${row} already holds ${holders.map((h) => h.name).join(', ')}. Choose a free cell.`);
      return;
    }
    setRefusal(null);
    props.onEdit(setCell({ column, row }), 'cell');
  };
  const move = (event: React.KeyboardEvent<HTMLElement>, column: number, row: number): void => {
    const by: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    const step = by[event.key];
    if (step === undefined) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!locked) choose(column, row);
      }
      return;
    }
    event.preventDefault();
    const next = event.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-cell="${column + step[0]},${row + step[1]}"]`);
    next?.focus();
  };
  const cells: { column: number; row: number }[] = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) cells.push({ column, row });
  return (
    <div data-field-path="cell" aria-invalid={props.invalid === true ? true : undefined}>
      <div role="group" aria-label="Map cell" className={styles.cellGrid} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {cells.map(({ column, row }) => {
          const holders = holdersOf(props.families, props.selfId, { column, row });
          const mine = props.chosen !== undefined && props.chosen.column === column && props.chosen.row === row;
          const state = holders.length > 0 ? `holds ${holders.map((h) => h.name).join(', ')}` : mine ? 'chosen' : 'free';
          return (
            <button
              key={`${column},${row}`}
              type="button"
              className={styles.gridCell}
              data-cell={`${column},${row}`}
              data-state={holders.length > 0 ? 'taken' : mine ? 'mine' : 'free'}
              aria-label={`Column ${column}, row ${row}: ${state}`}
              aria-pressed={mine}
              aria-disabled={holders.length > 0 || locked ? true : undefined}
              onClick={() => (locked ? undefined : choose(column, row))}
              onKeyDown={(event) => move(event, column, row)}
            >
              {holders.length > 0 ? holders.map((h) => h.name).join(', ') : mine ? 'chosen' : 'free'}
            </button>
          );
        })}
      </div>
      {refusal === null ? null : (
        <p className={styles.notice} role="alert">
          {refusal}
        </p>
      )}
      {props.chosen === undefined ? (
        <p className={styles.hint}>No cell chosen: the map draws this family in the row below it.</p>
      ) : (
        <p className={styles.hint}>
          Cell: column {props.chosen.column}, row {props.chosen.row}.{' '}
          <Button {...(locked ? { unavailable: props.unavailable } : { onClick: () => props.onEdit(setCell(undefined)) })}>Remove the cell</Button>
        </p>
      )}
    </div>
  );
}
