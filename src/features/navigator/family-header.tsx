/**
 * The top of the family page (step 5.5b; ADR-037): the family's name and generic formula, the counts, the reaction types as text chips,
 * and the "Made from" / "Turns into" strip: the partner families as buttons with their counts; a button brings the reader to its group.
 * The family's tone (step 5.5c) tints the header; each partner button takes the PARTNER's own tone (step 5.5d); the group is written above the name, so colour is never the only carrier.
 */
import type { FamilyPartner, FamilyStudy } from '@/core/graph';
import { VisuallyHidden } from '@/ui/primitives';
import { examplesWords } from './family-items';
import { FormulaText } from './family-text';
import styles from './family-header.module.css';

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

function Partners(props: { readonly title: string; readonly empty: string; readonly partners: readonly FamilyPartner[]; readonly onGo: (hubId: string) => void }) {
  return (
    <div className={styles.partners}>
      <p className={styles.partnersTitle}>{props.title}</p>
      {props.partners.length === 0 ? (
        <p className={styles.muted}>{props.empty}</p>
      ) : (
        <ul className={styles.partnerList}>
          {props.partners.map((partner) => (
            <li key={partner.hubId}>
              <button type="button" className={styles.partner} data-tone={partner.tone} onClick={() => props.onGo(partner.hubId)}>
                {partner.name} <span className={styles.count}>{partner.reactionCount}</span>
                <VisuallyHidden>{partner.reactionCount === 1 ? ' reaction' : ' reactions'}</VisuallyHidden>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface FamilyHeaderProps {
  readonly study: FamilyStudy;
  readonly onGoToMadeFrom: (hubId: string) => void;
  readonly onGoToTurnsInto: (hubId: string) => void;
}

export function FamilyHeader({ study, onGoToMadeFrom, onGoToTurnsInto }: FamilyHeaderProps) {
  const { counts } = study;
  return (
    <div className={styles.header} data-tone={study.tone}>
      {study.group === undefined ? null : <p className={styles.group}>{study.group}</p>}
      <h1 className={styles.familyName}>
        {study.name}
        {study.formula === undefined ? null : (
          <span className={styles.familyFormula}>
            <FormulaText formula={study.formula} />
          </span>
        )}
      </h1>
      <p className={styles.counts}>
        {plural(counts.total, 'reaction', 'reactions')}
        {examplesWords(counts.examples)} in all: {plural(counts.reactionsOf, 'reaction', 'reactions')}
        {examplesWords(study.reactionsOf.exampleCount)} of {study.name} and {plural(counts.preparationOf, 'reaction', 'reactions')}
        {examplesWords(study.preparationOf.exampleCount)} that make it
        {counts.total < counts.reactionsOf + counts.preparationOf ? ' (a reaction of the family into itself is in both and counted once in the total)' : ''}.
      </p>
      {study.reactionTypes.length === 0 ? null : (
        <ul className={styles.types} aria-label="Reaction types in this family">
          {study.reactionTypes.map((type) => (
            <li key={type.conceptId} className={styles.chip}>
              {type.name} <span className={styles.count}>{type.count}</span>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.strip}>
        <Partners title="Made from" empty="Nothing in this dataset makes it" partners={study.madeFrom} onGo={onGoToMadeFrom} />
        <Partners title="Turns into" empty="It turns into nothing in this dataset" partners={study.turnsInto} onGo={onGoToTurnsInto} />
      </div>
    </div>
  );
}
