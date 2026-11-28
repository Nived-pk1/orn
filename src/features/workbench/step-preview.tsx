/**
 * The live preview of a mechanism step in the editor (step 8.5 M6): the DRAFT step drawn as before -> after with its curved arrows, under its
 * electron movements, like the reaction editor's preview. The drawing is `render/mechanism` (the one the study view uses); this file only turns the
 * draft into what it needs. A movement that is not complete yet (a site or the electron count missing) is left out and counted in a quiet line; a
 * species row with no role is left out the same way. The draft is settled 400 ms before it is drawn again (the structure tool is asked once per
 * pause, not per key).
 */
import { useEffect, useState } from 'react';
import { STEP_SPECIES_ROLES, type StructureRep } from '@/core/schema';
import { StepDrawing, type DrawableStep, type StepDrawingPort } from '@/render/mechanism';
import { readRows } from './step-model';
import { siteOfDraft } from './step-rows-model';
import styles from './editor.module.css';

export const PREVIEW_SETTLE_MS = 400;

interface Drafted {
  readonly step: DrawableStep;
  readonly incomplete: number;
  readonly roleless: number;
}

const isRole = (value: unknown): value is (typeof STEP_SPECIES_ROLES)[number] => (STEP_SPECIES_ROLES as readonly unknown[]).includes(value);

function draftedStep(draft: unknown, v: number, s: number): Drafted {
  const species: DrawableStep['species'][number][] = [];
  let roleless = 0;
  for (const row of readRows(draft, v, s, 'species')) {
    const rep = row['structure'] as { format?: unknown; value?: unknown } | undefined;
    const structure = typeof rep?.value === 'string' && rep.value !== '' && (rep.format === 'smiles' || rep.format === 'cxsmiles' || rep.format === 'molfile') ? ({ format: rep.format, value: rep.value } as StructureRep) : undefined;
    const label = typeof row['label'] === 'string' && row['label'] !== '' ? row['label'] : undefined;
    if (!isRole(row['role'])) {
      roleless += 1;
      continue;
    }
    if (structure === undefined && label === undefined) continue; // a record-only row has nothing to draw
    species.push({ role: row['role'], ...(label === undefined ? {} : { label }), ...(structure === undefined ? {} : { structure }) });
  }
  const movements: DrawableStep['electronMovements'][number][] = [];
  let incomplete = 0;
  for (const row of readRows(draft, v, s, 'electronMovements')) {
    const from = siteOfDraft(row['from']);
    const to = siteOfDraft(row['to']);
    const electrons = row['electrons'];
    if (from === undefined || to === undefined || (electrons !== 1 && electrons !== 2)) incomplete += 1;
    else movements.push({ from, to, electrons });
  }
  const previous = s === 0 ? {} : { previous: draftedStep(draft, v, s - 1).step };
  return { step: { number: s + 1, species, electronMovements: movements, reversible: stepReversible(draft, v, s), ...previous }, incomplete, roleless };
}

function stepReversible(draft: unknown, v: number, s: number): boolean {
  const variants = (draft as { variants?: { steps?: { reversible?: unknown }[] }[] } | null)?.variants;
  return variants?.[v]?.steps?.[s]?.reversible === true;
}

function useSettled<T>(value: T, key: string, timers: { after(ms: number, run: () => void): () => void }): T {
  const [shown, setShown] = useState(value);
  useEffect(() => timers.after(PREVIEW_SETTLE_MS, () => setShown(value)), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return shown;
}

export const incompleteWords = (n: number): string => (n === 1 ? '1 electron movement is not complete yet, so its arrow is not drawn.' : `${n} electron movements are not complete yet, so their arrows are not drawn.`);

export function StepPreview(props: { readonly draft: unknown; readonly v: number; readonly s: number; readonly port: StepDrawingPort; readonly timers: { after(ms: number, run: () => void): () => void }; readonly phone: boolean }) {
  const now = draftedStep(props.draft, props.v, props.s);
  const settled = useSettled(now, JSON.stringify(now), props.timers);
  return (
    <div className={styles.field} data-step-preview="">
      <h5 className={styles.hint}>{`Preview of step ${props.s + 1}`}</h5>
      <StepDrawing step={settled.step} port={props.port} orientation={props.phone ? 'column' : 'row'} />
      {settled.incomplete > 0 ? <p className={styles.hint}>{incompleteWords(settled.incomplete)}</p> : null}
      {settled.roleless > 0 ? <p className={styles.hint}>{`${settled.roleless} species row${settled.roleless === 1 ? ' has' : 's have'} no role yet, so ${settled.roleless === 1 ? 'it is' : 'they are'} not drawn.`}</p> : null}
    </div>
  );
}
