/**
 * One mechanism's page (step 7.4 E): name, "also called", classes as words, the summary, the concepts as links, the steps (one list for a
 * single pathway, a section per variant for two or more), pictures, the reactions that use it as their own cards, the caveats, "In chapters",
 * study notes. "Edit" only when the app gives it. The data is the core's (`@/core/mechanisms`). Curved arrows are not drawn (Phase 8).
 */
import { useMemo } from 'react';
import { useStore } from 'zustand';
import { NO_CHAPTER_TITLE } from '@/core/chapters';
import { mechanismPage } from '@/core/mechanisms';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { currentOf, useScopeOnly, type ActiveExam } from '@/ui/state';
import { CaveatSection, ChaptersLine, LinkLine, PageHeader, ReactionCards, studyPageStyles as styles, useScopeLens } from '@/ui/study-page';
import type { MechanismPorts } from './contracts';
import { VariantSteps } from './mechanism-steps';

export function MechanismPage(props: { readonly ports: MechanismPorts; readonly state: CanonicalState; readonly indexes: ReadonlyIndexes; readonly id: string; readonly active: ActiveExam | null }) {
  const { ports, state, indexes, id, active } = props;
  const onlyInScope = useScopeOnly(ports.ui.exam);
  const inspector = useStore(ports.ui.inspector, (s) => currentOf(s));
  const set = ports.ui.mechanisms.getState();
  const page = useMemo(() => mechanismPage(state, indexes, id), [state, indexes, id]);
  const lens = useScopeLens(state, indexes, active, onlyInScope);
  if (page === undefined) return null;
  const conceptRef = (conceptId: string): RecordRef => ({ kind: 'concept', id: conceptId }) as RecordRef;
  const classes = page.classes.map((one) => ({ id: one.id, name: one.certainty === 'definite' ? one.name : `${one.name} (${one.certainty})` }));
  const single = page.variants.length === 1;
  return (
    <>
      <PageHeader backLabel="All mechanisms" onBack={set.back} name={page.name} aliases={page.aliases} focusKey={id} />
      <div className={styles.factsBlock}>
        <LinkLine label="Kind of mechanism" items={classes} onOpen={(conceptId) => ports.select(conceptRef(conceptId))} />
      </div>
      {page.summary === undefined ? null : <div>{ports.renderRichText(page.summary)}</div>}
      <div className={styles.factsBlock}>
        <LinkLine label="Related ideas" items={page.concepts} onOpen={(conceptId) => ports.select(conceptRef(conceptId))} />
      </div>
      <div className={styles.bar}>
        {ports.edit === undefined ? null : (
          <button type="button" onClick={() => ports.edit?.(id)}>
            Edit
          </button>
        )}
      </div>
      {page.variants.length === 0 ? <p className={styles.muted}>No step is written for this mechanism yet.</p> : null}
      {page.variants.map((variant) => (
        <VariantSteps key={variant.id} ports={ports} variant={variant} heading={!single} />
      ))}
      {ports.renderPictures({ kind: 'mechanism', id } as RecordRef)}
      <section className={styles.section} aria-label="Reactions that use it">
        <h3 className={styles.sectionHeading}>{`Reactions that use it (${page.reactions.count})`}</h3>
        <ReactionCards
          reactions={page.reactions.reactions}
          examplesOf={page.reactions.examplesOf}
          outsideOf={lens.outsideWords}
          onlyInScope={onlyInScope}
          examName={lens.examName}
          onShowAll={() => ports.ui.exam.getState().setMode('everything')}
          selectedId={inspector === null ? null : inspector.id}
          renderCard={ports.renderCard}
          onSelect={ports.selectReaction}
          emptyWords="No reaction uses this mechanism yet."
        />
      </section>
      <CaveatSection caveats={page.caveats} renderRichText={ports.renderRichText} onOpen={(caveatId) => ports.select({ kind: 'caveat', id: caveatId } as RecordRef)} />
      <ChaptersLine chapters={page.chapters} onOpen={ports.openChapter} none={ports.edit === undefined ? undefined : NO_CHAPTER_TITLE} />
      {page.studyNotes === undefined ? null : (
        <section className={styles.section} aria-label="Study notes">
          <h3 className={styles.sectionHeading}>Study notes</h3>
          <div>{ports.renderRichText(page.studyNotes)}</div>
        </section>
      )}
    </>
  );
}
