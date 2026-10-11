/**
 * The family page (step 5.5b; ADR-037): one family as a readable HTML page. It replaces the canvas; "Overview" goes back to the map as it
 * was (the viewport and the selection live in UI stores the page does not touch). The header (name, counts, types, partner strip) and
 * the two sections are items of ONE virtualised list; a card is a reaction in one group. Depictions are requested only for mounted
 * cards (`useDepiction`). A click on a card selects the reaction (the inspector, step 5.6a, will show its detail).
 * Keyboard focus (step 5.7): the map that had it is gone, so the page takes it on its Overview button, which is also the way back.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import { Button, Skeleton, VirtualList, type VirtualListHandle } from '@/ui/primitives';
import { depictionBindingOf } from './depictions';
import { FamilyCardView } from './family-card';
import { FamilyEnvContext, type FamilyEnv } from './family-env';
import { FamilyHeader } from './family-header';
import { cardKey, estimateOf, familyItems, groupKey, indexOfKey, type FamilyItem } from './family-items';
import { useNavigator } from './navigator-context';
import { createScenePorts } from './scene-ports';
import { useFamilyStudy } from './use-family-study';
import styles from './family-page.module.css';

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
const keyOf = (item: FamilyItem): string => item.key;

export function FamilyPage(props: { readonly hubId: string }) {
  const { ports } = useNavigator();
  const { hubId } = props;
  const study = useFamilyStudy(ports, hubId);
  const target = useStore(ports.ui.family, (s) => s.target);
  const selectedReaction = useStore(ports.ui.family, (s) => s.reaction);
  const list = useRef<VirtualListHandle>(null);
  const page = useRef<HTMLElement>(null);
  // Opening the page removes the map and the focus with it (the body has it): the Overview button takes it. A focus that is somewhere else stays.
  useEffect(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) page.current?.querySelector<HTMLElement>('[role="toolbar"] button')?.focus({ preventScroll: true });
  }, [hubId]);
  const binding = depictionBindingOf(ports);
  const items = useMemo(() => (study === undefined || study === null ? [] : familyItems(study)), [study]);
  // The names and keys a card reads come from the snapshot the study was computed from.
  const env = useMemo<FamilyEnv | null>(() => {
    if (study === undefined || study === null) return null;
    const scene = createScenePorts(ports.store.getState(), binding?.keyOf);
    return { describe: scene.describe, keyOf: scene.depictionKeyOf, manager: binding?.manager, timers: ports.timers };
  }, [study, ports, binding]);

  const goTo = useCallback(
    (key: string): void => {
      const index = indexOfKey(items, key);
      if (index >= 0) list.current?.scrollToIndex(index);
    },
    [items],
  );
  // A request from outside (a selected arrow opens its source family at the target's group): brought once the list has its items.
  useEffect(() => {
    if (target === null || items.length === 0) return;
    goTo(groupKey(target.section, target.hubId));
    ports.ui.family.getState().clearTarget();
  }, [target, items, goTo, ports]);

  const selectReaction = useCallback((reactionId: string): void => ports.ui.family.getState().selectReaction(reactionId), [ports]);
  const goToGroup = useCallback(
    (item: Extract<FamilyItem, { kind: 'card' }>) => (otherHub: string, reactionId: string) => goTo(cardKey(item.section, otherHub, reactionId)),
    [goTo],
  );

  const renderBody = useCallback(
    (item: FamilyItem) => {
      switch (item.kind) {
        case 'header':
          return <FamilyHeader study={item.study} onGoToMadeFrom={(id) => goTo(groupKey('preparation_of', id))} onGoToTurnsInto={(id) => goTo(groupKey('reactions_of', id))} />;
        case 'section':
          return (
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>{item.title}</h2>
              <span className={styles.muted}>{plural(item.reactionCount, 'reaction', 'reactions')}</span>
            </div>
          );
        case 'empty':
          return <p className={styles.empty}>{item.text}.</p>;
        case 'group':
          return (
            <div className={styles.groupHead} data-group-id={item.hubId}>
              <h3 className={styles.groupTitle}>{item.title}</h3>
              <span className={styles.muted}>{plural(item.count, 'reaction', 'reactions')}</span>
            </div>
          );
        case 'card':
          return <FamilyCardView card={item.card} selected={selectedReaction === item.card.reactionId} onSelect={selectReaction} onGoToGroup={goToGroup(item)} />;
      }
    },
    [goTo, goToGroup, selectReaction, selectedReaction],
  );
  const renderItem = useCallback((item: FamilyItem) => <div className={styles.item}>{renderBody(item)}</div>, [renderBody]);

  const close = useCallback((): void => ports.ui.family.getState().closeFamily(), [ports]);
  const reactionName = study === undefined || study === null || selectedReaction === null ? undefined : (ports.store.getState().records.reaction[selectedReaction]?.name ?? selectedReaction);
  const title = study === undefined || study === null ? 'Family' : study.name;
  return (
    <section ref={page} className={styles.page} aria-label={`Family page: ${title}`} data-family-page="" data-family-id={hubId}>
      <div className={styles.toolbar} role="toolbar" aria-label="Family page tools">
        <Button onClick={close}>Overview</Button>
        <p className={styles.selection}>{reactionName === undefined ? 'Nothing is selected.' : `Selected: reaction ${reactionName}.`}</p>
      </div>
      <div className={styles.body}>
        {study === undefined ? (
          <Skeleton label="Preparing the family page" />
        ) : study === null || env === null ? (
          <div className={styles.missing} role="alert">
            <p>This family is not in the dataset any more.</p>
            <Button onClick={close}>Back to the overview</Button>
          </div>
        ) : (
          <FamilyEnvContext.Provider value={env}>
            <VirtualList items={items} itemKey={keyOf} estimateSize={estimateOf} renderItem={renderItem} label={`Reactions of and preparation of ${study.name}`} ref={list} />
          </FamilyEnvContext.Provider>
        )}
      </div>
    </section>
  );
}
