/**
 * One named reaction's page (step 7.4 D): name and "also called", the summary, the family as links ("Part of", "Kinds"), "Learn first" and
 * "Related ideas" (concepts open in the inspector), the reactions as the reactions' own cards with the typical-conditions box BESIDE them on a
 * desktop and ABOVE them on a phone (never inside a card), the mechanisms reached, the caveats, "In chapters", study notes, pictures. "Edit"
 * only when the app gives it. The data is the core's (`@/core/named-reactions`).
 */
import { useMemo } from 'react';
import { useStore } from 'zustand';
import { namedReactionPage } from '@/core/named-reactions';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import { NO_CHAPTER_TITLE } from '@/core/chapters';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { currentOf, type ActiveExam } from '@/ui/state';
import { CaveatSection, ChaptersLine, LinkLine, PageHeader, ReactionCards, ScopeBox, studyPageStyles as styles, useScopeLens } from '@/ui/study-page';
import type { NamedPorts } from './contracts';

export function NamedPage(props: { readonly ports: NamedPorts; readonly state: CanonicalState; readonly indexes: ReadonlyIndexes; readonly id: string; readonly active: ActiveExam | null }) {
  const { ports, state, indexes, id, active } = props;
  const onlyInScope = useStore(ports.ui.named, (s) => s.onlyInScope);
  const inspector = useStore(ports.ui.inspector, (s) => currentOf(s));
  const set = ports.ui.named.getState();
  const page = useMemo(() => namedReactionPage(state, indexes, id), [state, indexes, id]);
  const lens = useScopeLens(state, indexes, active, onlyInScope);
  if (page === undefined) return null;
  const conceptRef = (conceptId: string): RecordRef => ({ kind: 'concept', id: conceptId }) as RecordRef;
  const conditions = page.typicalConditions;
  const hasCards = page.reactions.count > 0;
  return (
    <>
      <PageHeader backLabel="All named reactions" onBack={set.back} name={page.name} aliases={page.aliases} focusKey={id} />
      {page.summary === undefined ? null : <div>{ports.renderRichText(page.summary)}</div>}
      <div className={styles.factsBlock}>
        <LinkLine label="Part of" items={page.parents} onOpen={set.open} />
        <LinkLine label="Kinds" items={page.children} onOpen={set.open} />
        <LinkLine label="Learn first" items={page.prerequisites} onOpen={(conceptId) => ports.select(conceptRef(conceptId))} />
        <LinkLine label="Related ideas" items={page.concepts} onOpen={(conceptId) => ports.select(conceptRef(conceptId))} />
      </div>
      <div className={styles.bar}>
        {hasCards ? (
          <button type="button" onClick={() => ports.showInReactions(id)}>
            Show these reactions in Reactions
          </button>
        ) : null}
        {ports.edit === undefined ? null : (
          <button type="button" onClick={() => ports.edit?.(id)}>
            Edit
          </button>
        )}
        <ScopeBox versionName={lens.versionName} checked={onlyInScope} onChange={set.setOnlyInScope} />
      </div>
      <section className={styles.section} aria-label="Reactions">
        <h3 className={styles.sectionHeading}>{`Reactions (${page.reactions.count})`}</h3>
        <div className={conditions === undefined ? undefined : styles.sectionBody}>
          {conditions === undefined ? null : (
            <aside className={styles.conditions} aria-label="Typical conditions">
              <h4 className={styles.conditionsTitle}>Typical conditions</h4>
              <div>{ports.renderRichText(conditions)}</div>
            </aside>
          )}
          <ReactionCards
            reactions={page.reactions.reactions}
            examplesOf={page.reactions.examplesOf}
            outsideOf={lens.outsideWords}
            onlyInScope={onlyInScope}
            selectedId={inspector === null ? null : inspector.id}
            renderCard={ports.renderCard}
            onSelect={ports.selectReaction}
            emptyWords="No reaction is written for this named reaction yet."
            hideNamedId={id}
          />
        </div>
      </section>
      {page.mechanisms.length === 0 ? null : (
        <section className={styles.section} aria-label="Mechanisms">
          <h3 className={styles.sectionHeading}>Mechanism</h3>
          <ul className={styles.caveats}>
            {page.mechanisms.map((mechanism) => (
              <li key={mechanism.id}>
                <button type="button" className={styles.linkButton} onClick={() => ports.openMechanism(mechanism.id)}>
                  {mechanism.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <CaveatSection caveats={page.caveats} renderRichText={ports.renderRichText} onOpen={(caveatId) => ports.select({ kind: 'caveat', id: caveatId } as RecordRef)} />
      <ChaptersLine chapters={page.chapters} onOpen={ports.openChapter} none={ports.edit === undefined ? undefined : NO_CHAPTER_TITLE} />
      {page.studyNotes === undefined ? null : (
        <section className={styles.section} aria-label="Study notes">
          <h3 className={styles.sectionHeading}>Study notes</h3>
          <div>{ports.renderRichText(page.studyNotes)}</div>
        </section>
      )}
      {ports.renderPictures({ kind: 'named_reaction', id } as RecordRef)}
    </>
  );
}
