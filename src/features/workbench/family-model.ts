/**
 * The map family editor's recipes and derived questions (step 6.6c part 4, M4). A map family is a navigator anchor of a class: label
 * (optional), group, tone, order and the cell on the overview grid. The tone belongs to the GROUP (PRS-005): an existing group brings its
 * tone, a new group chooses one. The grid is the CURRENT arrangement plus one free row and column. Stored as given (INV-24); the rules
 * (PRS-002, PRS-004, PRS-005) are the store's and the live panel's. No chemistry.
 */
import type { DraftRecipe } from '@/core/editing';
import { ANCHOR_TONES, GRID_CELL_MAX, type AnchorTone } from '@/core/schema';
import { capitalWord } from './curriculum-model';
import type { MapFamilyChoice } from './record-picker-contracts';

const capital = capitalWord;

export const TONE_WORDS: Readonly<Record<AnchorTone, string>> = Object.fromEntries(ANCHOR_TONES.map((tone) => [tone, capital(tone)])) as Record<AnchorTone, string>;
export const NEW_GROUP = '__new';

export const setLabel = (value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, 'label');
  else draft.label = value;
};
/** Sets the group text ("" removes it) and the tone the group already has (when it has none, the tone is left as it is). */
export const setGroup = (value: string, toneOfGroup: string | undefined): DraftRecipe => (draft) => {
  if (value === '') {
    Reflect.deleteProperty(draft, 'group');
    return;
  }
  draft.group = value;
  if (toneOfGroup !== undefined) draft.tone = toneOfGroup;
};
export const setTone = (value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, 'tone');
  else draft.tone = value;
};
export const setCell = (cell: { readonly column: number; readonly row: number } | undefined): DraftRecipe => (draft) => {
  if (cell === undefined) Reflect.deleteProperty(draft, 'cell');
  else draft.cell = { column: cell.column, row: cell.row };
};

type Cell = { readonly column: number; readonly row: number };
const sameCell = (a: Cell | undefined, b: Cell | undefined): boolean => a !== undefined && b !== undefined && a.column === b.column && a.row === b.row;

/** The groups of the other families, sorted by name; each with the tone of its lowest-ID family that has one (PRS-005). */
export function groupsOf(families: readonly MapFamilyChoice[], selfId: string): readonly { readonly name: string; readonly tone: string | undefined }[] {
  const found = new Map<string, string | undefined>();
  for (const family of families) {
    if (family.id === selfId || family.group === undefined) continue;
    if (!found.has(family.group) || found.get(family.group) === undefined) found.set(family.group, found.get(family.group) ?? family.tone);
  }
  return [...found.entries()].map(([name, tone]) => ({ name, tone })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** The grid: columns and rows from 0 to the used maximum plus one free column and row (at most the schema's `GRID_CELL_MAX`). */
export function gridSize(families: readonly MapFamilyChoice[], chosen: Cell | undefined): { readonly columns: number; readonly rows: number } {
  let columns = 0;
  let rows = 0;
  for (const cell of [...families.map((f) => f.cell), chosen]) {
    if (cell === undefined) continue;
    columns = Math.max(columns, cell.column + 1);
    rows = Math.max(rows, cell.row + 1);
  }
  return { columns: Math.min(columns + 1, GRID_CELL_MAX + 1), rows: Math.min(rows + 1, GRID_CELL_MAX + 1) };
}

/** The families on a cell, other than this one (a cell can hold several: the boxes stack, PRS-004 warns). */
export const holdersOf = (families: readonly MapFamilyChoice[], selfId: string, cell: Cell): readonly MapFamilyChoice[] => families.filter((f) => f.id !== selfId && sameCell(f.cell, cell));

export interface FamilyView {
  readonly id: string;
  readonly targetId: string;
  readonly label: string;
  readonly group: string;
  readonly tone: string;
  readonly order: number | undefined;
  readonly cell: Cell | undefined;
}

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

export function familyViewOf(draft: unknown): FamilyView {
  const fields = isBag(draft) ? draft : {};
  const target = isBag(fields.target) && typeof fields.target.id === 'string' ? fields.target.id : '';
  const cell = isBag(fields.cell) && typeof fields.cell.column === 'number' && typeof fields.cell.row === 'number' ? { column: fields.cell.column, row: fields.cell.row } : undefined;
  return {
    id: typeof fields.id === 'string' ? fields.id : '',
    targetId: target,
    label: typeof fields.label === 'string' ? fields.label : '',
    group: typeof fields.group === 'string' ? fields.group : '',
    tone: typeof fields.tone === 'string' ? fields.tone : '',
    order: typeof fields.order === 'number' ? fields.order : undefined,
    cell,
  };
}
