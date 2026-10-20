/**
 * The bond-change and electron-movement rows of ONE expanded mechanism step (step 6.5a decision D4). Nothing is typed as a number: a bond is
 * a CHOICE among the pairs of the atom maps the chem worker found in this step's structures, a movement's two sites a choice among their atoms,
 * lone pairs, radicals and bonds. A value the step's structures no longer have stays selectable and says so (nothing is changed silently, and
 * CHEM-008 marks the row). With no mapped structure the rows say "Add atom-mapped structures to this step first". Nothing is drawn as arrows
 * here (Phase 8, ADR-038). Text only; the recipes decide.
 */
import { Button } from '@/ui/primitives';
import { addBond, addMovement, pairOfValue, pairValue, removeBond, removeMovement, setBondOrder, setBondPair, setMovementElectrons, setMovementSite, siteOfDraft, siteOfValue, siteValue, type BondField, type Pair, type SiteEnd } from './step-rows-model';
import { MISSING_MAP_NOTE, addReason, pairWords, pairsOf, siteWords, sitesOf, type StepMaps } from './step-maps';
import { readRows, type Fields } from './step-model';
import type { SectionProps } from './section-props';
import styles from './editor.module.css';
import own from './participant.module.css';

export interface StepRowsProps extends SectionProps {
  readonly v: number;
  readonly s: number;
  readonly maps: StepMaps;
}

const pairOf = (value: unknown): Pair | undefined => (Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === 'number') ? [value[0] as number, value[1] as number] : undefined);
const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);
const REMOVE_ROW = 'Remove';

/** The one line under the rows of a step that says why bonds and movements cannot be added (no mapped structure yet, still reading, no answer). */
export function MapsNote(props: { readonly maps: StepMaps }) {
  const reason = props.maps.phase === 'ready' && props.maps.maps.length > 0 ? undefined : addReason(props.maps, 1);
  return reason === undefined ? null : <p className={styles.hint}>{reason}</p>;
}

export function BondRows(props: StepRowsProps & { readonly field: BondField }) {
  const { v, s, field, maps, onEdit } = props;
  const locked = props.unavailable;
  const formed = field === 'bondsFormed';
  const noun = formed ? 'bond formed' : 'bond broken';
  const rows = readRows(props.draft, v, s, field);
  const pairs = pairsOf(maps.maps);
  const why = locked ?? addReason(maps, 2);
  return (
    <div className={styles.field}>
      <h5 className={styles.hint}>{formed ? 'Bonds formed' : 'Bonds broken'}</h5>
      {rows.length === 0 ? <p className={styles.hint}>None.</p> : null}
      <ul className={styles.list} aria-label={formed ? 'Bonds formed' : 'Bonds broken'}>
        {rows.map((row, index) => {
          const n = index + 1;
          const path = `variants[${v}].steps[${s}].${field}[${index}]`;
          const pair = pairOf(row['atoms']);
          const known = pair !== undefined && pairs.some((p) => p[0] === pair[0] && p[1] === pair[1]);
          const order = typeof row['order'] === 'number' ? String(row['order']) : '';
          return (
            <li key={index} className={`${own.participantHead} ${props.phone === true ? own.participantPhone : ''}`} data-testid="bond-row" data-phone={props.phone === true ? 'true' : undefined}>
              <select aria-label={`Atoms of ${noun} ${n}`} value={pair === undefined ? '' : pairValue(pair)} disabled={locked !== undefined} aria-invalid={bad(props, path)} data-field-path={path} onChange={(event) => onEdit(setBondPair(v, s, field, index, pairOfValue(event.target.value)), path)}>
                {pair === undefined ? <option value="">Choose the atoms</option> : null}
                {pair !== undefined && !known ? <option value={pairValue(pair)}>{pairWords(pair)} ({MISSING_MAP_NOTE})</option> : null}
                {pairs.map((p) => (
                  <option key={pairValue(p)} value={pairValue(p)}>
                    {pairWords(p)}
                  </option>
                ))}
              </select>
              <select aria-label={`Order of ${noun} ${n}`} value={order} disabled={locked !== undefined} data-field-path={`${path}.order`} onChange={(event) => onEdit(setBondOrder(v, s, field, index, event.target.value === '' ? undefined : (Number(event.target.value) as 1 | 2 | 3)), `${path}.order`)}>
                <option value="">Order not stated</option>
                <option value="1">Single</option>
                <option value="2">Double</option>
                <option value="3">Triple</option>
              </select>
              <Button aria-label={`Remove ${noun} ${n}`} {...(locked !== undefined ? { unavailable: locked } : { onClick: () => onEdit(removeBond(v, s, field, index)) })}>
                {REMOVE_ROW}
              </Button>
            </li>
          );
        })}
      </ul>
      <Button aria-label={`Add ${noun}`} {...(why !== undefined ? { unavailable: why } : { onClick: () => onEdit(addBond(v, s, field)) })}>
        {`Add ${noun}`}
      </Button>
    </div>
  );
}

function SiteSelect(props: StepRowsProps & { readonly index: number; readonly end: SiteEnd; readonly row: Fields }) {
  const { v, s, index, end, maps, onEdit } = props;
  const label = `${end === 'from' ? 'From' : 'To'} of movement ${index + 1}`;
  const path = `variants[${v}].steps[${s}].electronMovements[${index}].${end}`;
  const current = siteOfDraft(props.row[end]);
  const sites = sitesOf(maps.maps);
  const known = current !== undefined && sites.some((site) => siteValue(site) === siteValue(current));
  return (
    <select aria-label={label} value={current === undefined ? '' : siteValue(current)} disabled={props.unavailable !== undefined} aria-invalid={bad(props, path)} data-field-path={path} onChange={(event) => onEdit(setMovementSite(v, s, index, end, siteOfValue(event.target.value)), path)}>
      {current === undefined ? <option value="">Choose a site</option> : null}
      {current !== undefined && !known ? <option value={siteValue(current)}>{siteWords(current)} ({MISSING_MAP_NOTE})</option> : null}
      {sites.map((site) => (
        <option key={siteValue(site)} value={siteValue(site)}>
          {siteWords(site)}
        </option>
      ))}
    </select>
  );
}

export function MovementRows(props: StepRowsProps) {
  const { v, s, maps, onEdit } = props;
  const locked = props.unavailable;
  const rows = readRows(props.draft, v, s, 'electronMovements');
  const why = locked ?? addReason(maps, 1);
  return (
    <div className={styles.field}>
      <h5 className={styles.hint}>Electron movements</h5>
      {rows.length === 0 ? <p className={styles.hint}>None.</p> : null}
      <ul className={styles.list} aria-label="Electron movements">
        {rows.map((row, index) => {
          const n = index + 1;
          const path = `variants[${v}].steps[${s}].electronMovements[${index}]`;
          const electrons = typeof row['electrons'] === 'number' ? String(row['electrons']) : '';
          return (
            <li key={index} className={`${own.participantHead} ${props.phone === true ? own.participantPhone : ''}`} data-testid="movement-row" data-phone={props.phone === true ? 'true' : undefined}>
              <SiteSelect {...props} index={index} end="from" row={row} />
              <span aria-hidden="true">to</span>
              <SiteSelect {...props} index={index} end="to" row={row} />
              <select aria-label={`Electrons of movement ${n}`} value={electrons} disabled={locked !== undefined} aria-invalid={bad(props, `${path}.electrons`)} data-field-path={`${path}.electrons`} onChange={(event) => onEdit(setMovementElectrons(v, s, index, event.target.value === '' ? undefined : (Number(event.target.value) as 1 | 2)), `${path}.electrons`)}>
                {electrons === '' ? <option value="">Choose 1 or 2</option> : null}
                <option value="1">1 electron</option>
                <option value="2">2 electrons</option>
              </select>
              <Button aria-label={`Remove movement ${n}`} {...(locked !== undefined ? { unavailable: locked } : { onClick: () => onEdit(removeMovement(v, s, index)) })}>
                {REMOVE_ROW}
              </Button>
            </li>
          );
        })}
      </ul>
      <Button aria-label="Add electron movement" {...(why !== undefined ? { unavailable: why } : { onClick: () => onEdit(addMovement(v, s)) })}>
        Add electron movement
      </Button>
      {rows.length > 0 ? <p className={styles.hint}>Curved arrows are drawn in a later phase; here the movements are rows.</p> : null}
    </div>
  );
}
