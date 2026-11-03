/**
 * The new inspector body (step 8.1 Part C; ADR-043): ONE layout for every kind, in the order a student reads it: the kind chip and title,
 * the hero, the lead, the key facts, the watch-out, where to go next, the connected cards, the chapters and the notes. The model decides
 * what each holds; this only draws it. Studio adds the closed "For authors" section after it (everything the old levels showed).
 */
import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import type { AnyRecord, Reaction, RecordRef } from '@/core/schema';
import { FullEquations } from './equation';
import { useInspectorEnv } from './env';
import { studyInspectorModel } from './model/study-model';
import { StudyHero } from './study-hero';
import { Chips, Connected, Disclosure, GoNext, Lead, WatchOuts, type GoNextAction } from './study-parts';
import { RichText } from './rich-text';
import styles from './study-inspector.module.css';

const InChapters = lazy(() => import('./in-chapters').then((module) => ({ default: module.InChapters })));

export interface StudyInspectorProps {
  readonly refOf: RecordRef;
  readonly record: AnyRecord;
  readonly authors: boolean;
  /** The back / forward buttons and the Studio buttons, drawn on the header line. */
  readonly headerExtras: ReactNode;
  readonly goNext: readonly GoNextAction[];
  readonly titleId: string;
  /** Studio only: lines about the author's view (place line, badges). */
  readonly authorLines: ReactNode;
  /** Studio: the body of "For authors" (the host of the layout makes it, so this file does not reach the views that load it). */
  readonly authorsPanel: ReactNode;
  /** True when the record was opened AT something (a mechanism variant): the author section starts open so the target is shown. */
  readonly authorsOpen: boolean;
}

export function StudyInspector(props: StudyInspectorProps) {
  const { ports, state } = useInspectorEnv();
  const model = useMemo(
    () => studyInspectorModel(props.refOf, { state, indexes: ports.indexes.current() }, props.authors ? 'studio' : 'study'),
    [props.refOf, state, ports, props.authors],
  );
  if (model === undefined) return null;
  return (
    <>
      <header className={styles.head}>
        <div className={styles.headText}>
          <span className={styles.kindChip} {...(model.kindChip.tone === undefined ? {} : { 'data-tone': model.kindChip.tone })}>
            {model.kindChip.word}
          </span>
          <h3 id={props.titleId} className={styles.titleText}>{model.title}</h3>
        </div>
        {props.headerExtras}
      </header>
      {props.authorLines}
      <StudyHero hero={model.hero} />
      {props.refOf.kind === 'reaction' ? (
        <div data-sheet-full="">
          <FullEquations record={props.record as Reaction} />
        </div>
      ) : null}
      {model.lead === undefined ? null : <Lead source={model.lead.source} />}
      <Chips chips={model.facts} />
      <WatchOuts items={model.watchOut} />
      <GoNext actions={props.goNext} />
      <Connected groups={model.connected} />
      <Suspense fallback={null}>
        <InChapters refOf={props.refOf} />
      </Suspense>
      {model.notes === undefined ? null : (
        <Disclosure title="Notes" full>
          <RichText source={model.notes} />
        </Disclosure>
      )}
      {!props.authors ? null : (
        <Disclosure title="For authors" full open={props.authorsOpen}>
          {props.authorsPanel}
        </Disclosure>
      )}
    </>
  );
}
