/**
 * The study card of one record on a chapter page (step 7.3b D3): readable on the page, so a concept shows its text and pictures, a caveat
 * its rule and statement, a mechanism its variants and step count, a species or class its drawing, a reagent its families, a route its
 * steps. The other features' renderers are the ports' (injected); the text is the record's own (no chemistry decided here). Clicking a card
 * selects the record in the inspector. A record outside the chosen exam scope keeps its card, dashed, with the words "outside <exam>".
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { ChaptersPorts } from './contracts';
import styles from './chapters-view.module.css';

type Loose = Readonly<Record<string, unknown>>;
const textOf = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

/** Text clamped after about 8 lines; "Read more" appears only when the text is cut. */
function Clamped(props: { readonly children: ReactNode; readonly label: string }) {
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (el !== null && !open) setCut(el.scrollHeight > el.clientHeight + 1);
  });
  return (
    <div>
      <div ref={box} className={open ? undefined : styles.clamp} data-clamped={open ? undefined : ''}>
        {props.children}
      </div>
      {cut || open ? (
        <button type="button" className={styles.readMore} aria-expanded={open} aria-label={`${open ? 'Show less of' : 'Read more of'} ${props.label}`} onClick={(event) => (event.stopPropagation(), setOpen(!open))}>
          {open ? 'Show less' : 'Read more'}
        </button>
      ) : null}
    </div>
  );
}

function BodyOf(props: { readonly record: Loose; readonly refOf: RecordRef; readonly ports: ChaptersPorts; readonly state: CanonicalState }) {
  const { record, refOf, ports } = props;
  const name = ports.nameOf(refOf);
  switch (refOf.kind) {
    case 'concept':
    case 'named_reaction':
    case 'transformation': {
      const source = textOf(refOf.kind === 'transformation' ? record.description : record.summary);
      return (
        <>
          {source === undefined ? <p className={styles.muted}>No text yet.</p> : <Clamped label={name}>{ports.renderRichText(source)}</Clamped>}
          {ports.renderPictures(refOf)}
        </>
      );
    }
    case 'caveat': {
      const rule = textOf(record.rule);
      const statement = textOf(record.statement);
      return (
        <>
          {rule === undefined ? null : (
            <div>
              <p className={styles.partHeading}>Rule</p>
              {ports.renderRichText(rule)}
            </div>
          )}
          {statement === undefined ? null : (
            <div>
              <p className={styles.partHeading}>Statement</p>
              <Clamped label={name}>{ports.renderRichText(statement)}</Clamped>
            </div>
          )}
          {ports.renderPictures(refOf)}
        </>
      );
    }
    case 'mechanism': {
      const variants = Array.isArray(record.variants) ? (record.variants as readonly Loose[]) : [];
      const steps = variants.reduce((sum, variant) => sum + (Array.isArray(variant.steps) ? variant.steps.length : 0), 0);
      return (
        <>
          <p className={styles.muted}>{`${variants.length} ${variants.length === 1 ? 'variant' : 'variants'} · ${steps} ${steps === 1 ? 'step' : 'steps'}`}</p>
          <button type="button" aria-label={`Open ${name}`} onClick={(event) => (event.stopPropagation(), ports.select(refOf))}>
            Open
          </button>
        </>
      );
    }
    case 'species':
    case 'class':
      return <>{ports.renderSubstance(refOf)}</>;
    case 'reagent': {
      const families = Array.isArray(record.families) ? (record.families as readonly string[]).map((family) => family.replaceAll('_', ' ')) : [];
      return <p className={styles.muted}>{families.length === 0 ? 'No family stated' : families.join(', ')}</p>;
    }
    default:
      return null;
  }
}

export function StudyCard(props: {
  readonly refOf: RecordRef;
  readonly ports: ChaptersPorts;
  readonly state: CanonicalState;
  readonly selected: boolean;
  /** "outside JEE Main" when the record is outside the chosen scope. */
  readonly outside: string | undefined;
}) {
  const { refOf, ports, state, selected, outside } = props;
  const record = (state.records[refOf.kind] as Readonly<Record<string, Loose>>)[refOf.id];
  const name = ports.nameOf(refOf);
  if (refOf.kind === 'route') {
    return (
      <li className={styles.cardItem} data-record-kind="route" data-record-id={refOf.id}>
        {ports.renderRoute(refOf.id, null, ports.selectReaction)}
      </li>
    );
  }
  return (
    <li className={styles.cardItem}>
      <article className={styles.card} aria-label={name} data-record-kind={refOf.kind} data-record-id={refOf.id} data-selected={selected ? '' : undefined} data-outside={outside === undefined ? undefined : ''} onClick={() => ports.select(refOf)}>
        <h4 className={styles.cardTitle}>
          <button type="button" aria-pressed={selected} onClick={(event) => (event.stopPropagation(), ports.select(refOf))}>
            {name}
          </button>
        </h4>
        {outside === undefined ? null : <span className={`${styles.chip} ${styles.partialChip}`}>{outside}</span>}
        {record === undefined ? <p className={styles.muted}>This record is not in the dataset.</p> : <BodyOf record={record} refOf={refOf} ports={ports} state={state} />}
      </article>
    </li>
  );
}
