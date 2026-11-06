/**
 * One section of a reagent's page (step 7.3c D3): a profile (or "Used without a profile") with the reactions that use the reagent that way.
 * The profile's usual CONDITIONS sit in their own box BESIDE the cards on a desktop and ABOVE them on a phone; they are never merged into a
 * card's arrow text. Each card is the reaction's own family card, unchanged; under it "How it is used here: ...". 30 cards at a time. A reaction
 * outside the chosen exam scope keeps its card marked "outside <exam>", or is hidden by "Only <exam version>", and the section says how many.
 */
import { useState } from 'react';
import { plural, verbFor } from '@/core/text';
import { howUsedWords, type UsageSection } from '@/core/reagents';
import { HiddenLine } from '@/ui/study-page';
import { PAGE_SIZE, type ReagentsPorts } from './contracts';
import { reactionsWord } from './model';
import styles from './reagents-view.module.css';

export interface ScopeWords {
  /** "outside JEE Main" for a reaction outside the scope; undefined otherwise. */
  readonly outsideOf: (reactionId: string) => string | undefined;
  readonly onlyInScope: boolean;
  /** For the quiet line "n reactions outside JEE Main are hidden · Show them" (step 8.3b, B2). */
  readonly examName?: string | undefined;
  readonly onShowAll?: (() => void) | undefined;
}

export function ProfileSection(props: { readonly ports: ReagentsPorts; readonly section: UsageSection; readonly scope: ScopeWords; readonly selected: string | null }) {
  const { ports, section, scope } = props;
  const [limit, setLimit] = useState(PAGE_SIZE);
  const profile = section.profile;
  const kept = scope.onlyInScope ? section.reactions.filter((id) => scope.outsideOf(id) === undefined) : section.reactions;
  const left = section.reactions.length - kept.length;
  const shown = kept.slice(0, limit);
  const title = profile === undefined ? 'Used without a profile' : profile.label;
  const study = ports.edit === undefined;
  const unusedInStudy = study && profile !== undefined && section.count === 0;
  const phrases = profile === undefined ? [] : ports.conditionPhrases(profile.parameters);
  return (
    <section className={styles.section} aria-label={title} data-profile-id={section.profileId ?? 'none'}>
      <h3 className={styles.sectionHeading}>{unusedInStudy ? title : `${title} (${reactionsWord(section.count)})`}</h3>
      {profile === undefined || profile.aliases.length === 0 ? null : <p className={styles.muted}>{`also called ${profile.aliases.join(', ')}`}</p>}
      <div className={profile === undefined ? styles.sectionBodyPlain : styles.sectionBody}>
        {profile === undefined ? null : (
          <aside className={styles.conditions} aria-label="Usual conditions of this profile">
            <h4 className={styles.conditionsTitle}>Usual conditions of this profile</h4>
            {phrases.length === 0 ? (
              <p className={styles.muted}>No conditions are stated.</p>
            ) : (
              <ul className={styles.phrases}>
                {phrases.map((phrase) => (
                  <li key={phrase}>{phrase}</li>
                ))}
              </ul>
            )}
            {profile.behaviour === undefined ? null : <div>{ports.renderRichText(profile.behaviour)}</div>}
          </aside>
        )}
        <div className={styles.cards}>
          {section.reactions.length === 0 ? <p className={styles.muted}>{study ? 'No reaction here uses this profile.' : 'No reaction uses this profile yet.'}</p> : null}
          {left > 0 && scope.examName !== undefined && scope.onShowAll !== undefined ? <HiddenLine count={left} noun={['reaction', 'reactions']} examName={scope.examName} onShow={scope.onShowAll} /> : null}
          {left > 0 && (scope.examName === undefined || scope.onShowAll === undefined) ? <p className={styles.muted}>{`${plural(left, 'reaction', 'reactions')} ${verbFor(left, 'is', 'are')} left out by the exam scope.`}</p> : null}
          <ul className={styles.list}>
            {shown.map((id) => {
              const examples = (section.examplesOf.get(id) ?? []).filter((one) => !scope.onlyInScope || scope.outsideOf(one) === undefined);
              const outside = scope.outsideOf(id);
              const facts = section.factsOf.get(id) ?? [];
              return (
                <li key={id} className={styles.cardItem} data-reaction-id={id}>
                  {ports.renderCard({
                    reactionId: id,
                    selected: props.selected === id,
                    onSelect: ports.selectReaction,
                    ...(outside === undefined ? {} : { outside }),
                    ...(examples.length === 0 ? {} : { examples, selectedId: props.selected, outsideOf: scope.outsideOf }),
                    fallback: (reason) => <p className={styles.muted}>{`${id}: ${reason}`}</p>,
                  })}
                  {facts.length === 0 ? null : (
                    <p className={styles.how} data-how-used="">
                      {`How it is used here: ${facts.map(howUsedWords).join('; ')}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {kept.length > shown.length ? (
            <div className={styles.more}>
              <p className={styles.muted} role="status">{`Showing ${shown.length} of ${plural(kept.length, 'reaction', 'reactions')}`}</p>
              <button type="button" onClick={() => setLimit((n) => n + PAGE_SIZE)}>{`Show ${PAGE_SIZE} more`}</button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
