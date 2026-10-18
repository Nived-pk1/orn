/**
 * The family page (step 5.5b; ADR-037): one family as a readable HTML page. It replaces the canvas; "Overview" goes back to the map as it
 * was (the viewport and the selection live in UI stores the page does not touch). The header (name, counts, types, partner strip) and
 * the two sections are items of ONE virtualised list; a card is a reaction in one group. Depictions are requested only for mounted
 * cards (`useDepiction`). A click on a card selects the reaction (the inspector, step 5.6a, will show its detail).
 * Keyboard focus (step 5.7): the map that had it is gone, so the page takes it on its Overview button, which is also the way back.
 * Phone (ADR-039, phone mode B part 2): the full width in one column; "< Families" or "< Map" (where the visitor came from) instead of
 * "Overview", and no "Selected: ..." line (the sheet says it); a group is a coloured bar on the left, not a nested panel; while the sheet is
 * open the page keeps bottom space of the sheet's height (`--sheet-space`), and a tapped card is brought above the peek.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import { useStructureMode } from '@/render/svg';
import { useLayoutMode } from '@/ui/hooks';
import { Button, Skeleton, VirtualList, type VirtualListHandle } from '@/ui/primitives';
import { depictionBindingOf, equationBindingOf } from './depictions';
import { FamilyCardView } from './family-card';
import { FamilyEnvContext, type FamilyEnv } from './family-env';
import { FamilyHeader } from './family-header';
import { StructuresControl, StructuresMenu } from './structures-control';
import { cardKey, estimateOf, familyItems, groupKey, indexOfKey, type FamilyItem } from './family-items';
import { useNavigator } from './navigator-context';
import { createScenePorts } from './scene-ports';
import { useScope } from './use-scope';
import { useFamilyStudy } from './use-family-study';
import styles from './family-page.module.css';

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
const keyOf = (item: FamilyItem): string => item.key;
/** How long after a tap the card is still brought into view when the room changes (the sheet comes up a few frames later). */
const REVEAL_WINDOW_MS = 600;

export function FamilyPage(props: { readonly hubId: string }) {
  const { ports } = useNavigator();
  const { hubId } = props;
  const study = useFamilyStudy(ports, hubId);
  const scope = useScope(ports, study);
  const target = useStore(ports.ui.family, (s) => s.target);
  const selectedReaction = useStore(ports.ui.family, (s) => s.reaction);
  const list = useRef<VirtualListHandle>(null);
  const page = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const layout = useLayoutMode();
  const phone = layout === 'phone';
  const cameFrom = useStore(ports.ui.overview, (s) => s.phoneTab);
  // Opening the page removes the map and the focus with it (the body has it): the Overview button takes it. A focus that is somewhere else stays.
  useEffect(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) page.current?.querySelector<HTMLElement>('[role="toolbar"] button')?.focus({ preventScroll: true });
  }, [hubId]);
  const binding = depictionBindingOf(ports);
  // a change of the Structures setting makes every key again, in the new mode (the binding reads the mode when it makes a key)
  const structureMode = useStructureMode(ports.depictions);
  const items = useMemo(() => (study === undefined || study === null ? [] : familyItems(study)), [study]);
  // The names and keys a card reads come from the snapshot the study was computed from.
  const env = useMemo<FamilyEnv | null>(() => {
    if (study === undefined || study === null) return null;
    const scene = createScenePorts(ports.store.getState(), binding?.keyOf);
    return {
      describe: scene.describe,
      keyOf: scene.depictionKeyOf,
      manager: binding?.manager,
      timers: ports.timers,
      layout,
      equation: { binding: equationBindingOf(ports), facts: ports.facts, structures: ports.structures },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `structureMode` is read through the binding; it only has to make a new env
  }, [study, ports, binding, layout, structureMode]);
  // the bar of a group takes the partner family's own tone (the page's tone when the partner has none)
  const toneOf = useMemo(() => {
    const tones = new Map<string, string>();
    if (study !== undefined && study !== null) for (const partner of [...study.madeFrom, ...study.turnsInto]) if (partner.tone !== undefined) tones.set(partner.hubId, partner.tone);
    return (hubId: string): string | undefined => tones.get(hubId) ?? (study === undefined || study === null ? undefined : study.tone);
  }, [study]);

  // A tapped card's top is brought just under the bar (the area's top), so as much of it as possible is above the peek of the sheet; again when
  // the room changes (the sheet came up). The bottom space (--sheet-space) lets the end of the list be scrolled above the sheet.
  const reveal = useRef<string | null>(null);
  const revealCard = useCallback((): void => {
    const id = reveal.current;
    if (id === null) return;
    const card = [...(body.current?.querySelectorAll<HTMLElement>('article[data-reaction-id]') ?? [])].find((el) => el.dataset.reactionId === id);
    card?.scrollIntoView({ block: 'start' });
  }, []);
  useEffect(() => {
    const element = body.current;
    if (!phone || element === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(revealCard);
    observer.observe(element);
    // the room of the sheet is padding of the scroll area: a change of it (the sheet came up, its content changed) shows as a resize of the area
    const scroller = element.querySelector('[data-virtual-list]');
    if (scroller !== null) observer.observe(scroller);
    return () => observer.disconnect();
  }, [phone, revealCard, env]);

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

  const selectReaction = useCallback(
    (reactionId: string): void => {
      ports.ui.family.getState().selectReaction(reactionId);
      if (!phone) return;
      reveal.current = reactionId;
      ports.timers.after(REVEAL_WINDOW_MS, () => {
        if (reveal.current === reactionId) reveal.current = null;
      });
      requestAnimationFrame(revealCard);
    },
    [ports, phone, revealCard],
  );
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
          return <FamilyCardView card={item.card} selected={selectedReaction === item.card.reactionId} onSelect={selectReaction} onGoToGroup={goToGroup(item)} {...(scope.note !== undefined && scope.isOutside(item.card.reactionId) ? { outside: scope.note } : {})} />;
      }
    },
    [goTo, goToGroup, selectReaction, selectedReaction, scope],
  );
  const renderItem = useCallback(
    (item: FamilyItem) => {
      // on a phone the groups and their cards share a coloured bar on the left (the CSS draws it only there)
      const barred = phone && (item.kind === 'group' || item.kind === 'card');
      const bar = barred && (item.kind === 'group' || item.kind === 'card') ? toneOf(item.hubId) : undefined;
      return (
        <div className={styles.item} {...(barred ? { 'data-bar': '', ...(bar === undefined ? {} : { 'data-tone': bar }) } : {})}>
          {renderBody(item)}
        </div>
      );
    },
    [renderBody, toneOf, phone],
  );

  const close = useCallback((): void => ports.ui.family.getState().closeFamily(), [ports]);
  const reactionName = study === undefined || study === null || selectedReaction === null ? undefined : (ports.store.getState().records.reaction[selectedReaction]?.name ?? selectedReaction);
  const title = study === undefined || study === null ? 'Family' : study.name;
  return (
    <section ref={page} className={styles.page} aria-label={`Family page: ${title}`} data-family-page="" data-family-id={hubId} data-layout={layout} {...(phone ? { 'data-sheet-room': '' } : {})}>
      <div className={styles.toolbar} role="toolbar" aria-label="Family page tools">
        <Button onClick={close}>{phone ? `< ${cameFrom === 'map' ? 'Map' : 'Families'}` : 'Overview'}</Button>
        {phone ? null : <p className={styles.selection}>{reactionName === undefined ? 'Nothing is selected.' : `Selected: reaction ${reactionName}.`}</p>}
        {ports.structures === undefined ? null : (
          <div className={styles.structures}>
            {phone ? (
              <StructuresMenu structures={ports.structures} />
            ) : (
              <>
                <span className={styles.structuresLabel} aria-hidden="true">
                  Structures
                </span>
                <StructuresControl structures={ports.structures} />
              </>
            )}
          </div>
        )}
      </div>
      <div ref={body} className={styles.body}>
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
