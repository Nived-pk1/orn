/**
 * One reagent's page (step 7.3c D2, D3): its name, aliases, what it is made of, families and classes, "Part of: ...", the button that opens
 * Reactions filtered by it, Studio's "Edit", then one section per profile and "Used without a profile". The data is the core's
 * (`@/core/reagents`); the cards are the other features' (injected).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import { createScopeOf } from '@/core/graph';
import { reagentUsage } from '@/core/reagents';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { currentOf, type ActiveExam } from '@/ui/state';
import type { ReagentsPorts } from './contracts';
import { Formula } from './formula';
import { familyWord, reactionsWord } from './model';
import { ProfileSection } from './profile-section';
import styles from './reagents-view.module.css';

const roleWord = (role: string): string => role.replaceAll('_', ' ');

export function ReagentPage(props: { readonly ports: ReagentsPorts; readonly state: CanonicalState; readonly indexes: ReadonlyIndexes; readonly reagentId: string; readonly active: ActiveExam | null }) {
  const { ports, state, indexes, reagentId, active } = props;
  const reagent = state.records.reagent[reagentId];
  const onlyInScope = useStore(ports.ui.reagents, (s) => s.onlyInScope);
  const inspector = useStore(ports.ui.inspector, (s) => currentOf(s));
  const set = ports.ui.reagents.getState();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [reagentId]);
  const usage = useMemo(() => reagentUsage(state, indexes, reagentId), [state, indexes, reagentId]);
  const scopeOf = useMemo(() => (active === null ? undefined : createScopeOf(indexes, active.examId, active.examVersionId)), [indexes, active]);
  const examName = active === null ? undefined : (state.records.exam[active.examId]?.name ?? active.examId);
  const versionName = active === null ? undefined : (state.records.exam_version[active.examVersionId]?.label ?? active.examVersionId);
  const outsideOf = (reactionId: string): string | undefined => (examName !== undefined && scopeOf?.({ kind: 'reaction', id: reactionId } as RecordRef) === 'outside' ? `outside ${examName}` : undefined);
  if (reagent === undefined) return null;
  const link = (ref: RecordRef, label?: string) => (
    <button type="button" className={styles.linkButton} onClick={() => ports.select(ref)}>
      {label ?? ports.nameOf(ref)}
    </button>
  );
  const aliases = [...reagent.names.common, ...reagent.names.aliases];
  return (
    <>
      <header className={styles.header}>
        <button type="button" onClick={() => set.back()}>
          All reagents
        </button>
        <h2 ref={heading} tabIndex={-1} className={styles.title}>
          {ports.nameOf({ kind: 'reagent', id: reagentId } as RecordRef)}
        </h2>
        {reagent.formulaText === undefined ? null : (
          <span className={styles.formula}>
            <Formula formula={reagent.formulaText} />
          </span>
        )}
      </header>
      {aliases.length === 0 ? null : <p className={styles.muted}>{`also called ${aliases.join(', ')}`}</p>}
      <div className={styles.facts}>
        {reagent.speciesId === undefined ? null : <p>{'Made of: '}{link({ kind: 'species', id: reagent.speciesId } as RecordRef)}</p>}
        {reagent.components.length === 0 ? null : (
          <p>
            {'Made of: '}
            {reagent.components.map((part, i) => (
              <span key={`${part.ref.id}-${i}`}>
                {i > 0 ? '; ' : null}
                {link(part.ref as RecordRef)}
                {` (${roleWord(part.role)}${part.amountText === undefined ? '' : `, ${part.amountText}`})`}
              </span>
            ))}
          </p>
        )}
        {reagent.families.length === 0 ? null : <p>{`Families: ${reagent.families.map(familyWord).join(', ')}`}</p>}
        {reagent.classIds.length === 0 ? null : (
          <p>
            {'Classes: '}
            {reagent.classIds.map((id, i) => (
              <span key={id}>
                {i > 0 ? ', ' : null}
                {link({ kind: 'class', id } as RecordRef)}
              </span>
            ))}
          </p>
        )}
        {usage.partOf.length === 0 ? null : (
          <p>
            {'Part of: '}
            {usage.partOf.map((other, i) => (
              <span key={other.id}>
                {i > 0 ? ', ' : null}
                <button type="button" className={styles.linkButton} onClick={() => set.open(other.id)}>
                  {other.name}
                </button>
              </span>
            ))}
          </p>
        )}
        {reagent.description === undefined ? null : <div>{ports.renderRichText(reagent.description)}</div>}
      </div>
      <div className={styles.bar}>
        <button type="button" onClick={() => ports.showInReactions(reagentId)}>
          Show these reactions in Reactions
        </button>
        {ports.edit === undefined ? null : (
          <button type="button" onClick={() => ports.edit?.(reagentId)}>
            Edit
          </button>
        )}
        {versionName === undefined ? null : (
          <label className={styles.option}>
            <input type="checkbox" checked={onlyInScope} onChange={(event) => set.setOnlyInScope(event.target.checked)} />
            <span>{`Only ${versionName}`}</span>
          </label>
        )}
      </div>
      <p className={styles.muted}>{`${reactionsWord(usage.total)} use this reagent.`}</p>
      {usage.sections.map((section) => (
        <ProfileSection key={section.profileId ?? 'none'} ports={ports} section={section} scope={{ outsideOf, onlyInScope }} selected={inspector === null ? null : inspector.id} />
      ))}
    </>
  );
}

