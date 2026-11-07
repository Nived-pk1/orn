/**
 * "From A to B" (step 8.2b, C2; a lazy chunk): choose two families and see the chains of at most three family-to-family steps that lead from
 * one to the other, across ALL chapters. The chosen chain (the first by default) is reported so the map draws only its arrows; a step opens
 * that arrow's reactions like selecting the arrow does. Esc and Close close it, and closing clears the chain. The search is
 * `familyChains` (core); this only chooses and lists. Not saved.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Runs } from '@/render/equation';
import { partsToRuns } from '@/render/scene';
import { useStore } from 'zustand';
import type { RecordRef } from '@/core/schema';
// deep import: the chain search is only for this lazy chunk (a barrel would pull it into the first load)
import { CHAIN_MAX_STEPS, familyChains, familyEdgesOf, type FamilyChain } from '@/core/graph/navigator/chains';
import { UNCLASSIFIED_HUB_ID } from '@/core/graph/navigator/hubs';
import { Button } from '@/ui/primitives';
import type { NavigatorPorts } from './contracts';
import { chainCardsOf } from './chain-card';
import type { NamedFamily } from './find-family-match';
import { scopeLens, scopeNameOf } from './scope-lens';
import { useScopeOnly } from '@/ui/state';
import type { PairFacts } from './map-chips';
import styles from './chain-panel.module.css';

type Steps = readonly { readonly from: string; readonly to: string }[];

export interface ChainPanelProps {
  readonly families: readonly (NamedFamily & { readonly tone?: string | undefined })[];
  /** The roll-up's pairs (asked when the panel needs them). */
  readonly pairs: () => readonly { readonly from: string; readonly to: string; readonly candidates: readonly { readonly reactionId: string }[] }[];
  readonly facts: (from: string, to: string) => PairFacts | undefined;
  /** The steps the map draws, or undefined (nothing chosen). */
  readonly onChain: (steps: Steps | undefined) => void;
  readonly onOpenStep: (from: string, to: string) => void;
  readonly onClose: () => void;
  readonly phone?: boolean;
  /** The active exam scope (step 8.2b-fix, E4): only a reaction it accepts can be a step. Absent: All exams, every reaction counts. */
  readonly inScope?: ((reactionId: string) => boolean) | undefined;
  /** The exam's name for the words when the only chains are outside the scope. */
  readonly scopeName?: string | undefined;
}

export function ChainPanel(props: ChainPanelProps) {
  const { families, facts, onChain, onClose } = props;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [picked, setPicked] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const names = useMemo(() => new Map(families.map((f) => [f.id, f.name])), [families]);
  const nameOf = (id: string): string => names.get(id) ?? id;
  const tones = useMemo(() => new Map(families.map((f) => [f.id, f.tone] as const)), [families]);
  const toneOf = (id: string): string | undefined => tones.get(id);
  const edges = useMemo(() => familyEdgesOf(props.pairs(), new Set([UNCLASSIFIED_HUB_ID]), props.inScope), [props.pairs, props.inScope]); // eslint-disable-line react-hooks/exhaustive-deps -- `pairs` and `inScope` are the inputs
  const result = useMemo(() => (from === '' || to === '' ? undefined : familyChains(edges, from, to, { maxSteps: CHAIN_MAX_STEPS, nameOf })), [edges, from, to, names]); // eslint-disable-line react-hooks/exhaustive-deps -- nameOf reads `names`
  // under a scope with no chain: is there one outside it? Then the words say so (and show nothing of it)
  const outside = useMemo(() => {
    if (props.inScope === undefined || result === undefined || !result.ok || result.chains.length > 0) return false;
    const all = familyChains(familyEdgesOf(props.pairs(), new Set([UNCLASSIFIED_HUB_ID])), from, to, { maxSteps: CHAIN_MAX_STEPS, nameOf });
    return all.ok && all.chains.length > 0;
  }, [result, from, to]); // eslint-disable-line react-hooks/exhaustive-deps -- recomputed with the result
  const chains: readonly FamilyChain[] = result?.ok === true ? result.chains : [];
  const counts = useMemo(() => new Map(edges.map((edge) => [`${edge.from}>${edge.to}`, edge.reactionIds.length] as const)), [edges]);
  const cards = chainCardsOf(chains, picked, { nameOf, reactionsOf: (a, b) => counts.get(`${a}>${b}`) ?? 0 });
  const chosen = chains[Math.min(picked, chains.length - 1)];
  const steps: Steps | undefined = chosen?.steps.map((s) => ({ from: s.from, to: s.to }));
  const key = steps === undefined ? '' : steps.map((s) => `${s.from}>${s.to}`).join(',');
  useEffect(() => {
    onChain(steps);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the identity of `steps`
  }, [key, onChain]);
  useEffect(() => () => onChain(undefined), [onChain]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const choose = (setter: (v: string) => void, value: string): void => {
    setter(value);
    setPicked(0);
  };
  const stepWords = (a: string, b: string): ReactNode => {
    const found = facts(a, b);
    if (found === undefined) return '';
    if (found.parts !== undefined && found.parts.length > 0) return <Runs runs={partsToRuns(found.parts)} />;
    return found.words ?? `${found.reactions} ${found.reactions === 1 ? 'reaction' : 'reactions'}`;
  };
  const select = (label: string, value: string, set: (v: string) => void) => (
    <label className={styles.field}>
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => choose(set, event.target.value)}>
        <option value="">Choose a family</option>
        {families.map((family) => (
          <option key={family.id} value={family.id}>
            {family.name}
          </option>
        ))}
      </select>
    </label>
  );
  const shown = props.phone === true && !expanded ? cards.slice(0, 1) : cards;
  return (
    <aside className={styles.panel} data-right-pane="" aria-label="From A to B" data-phone={props.phone === true ? '' : undefined} data-expanded={expanded ? '' : undefined}>
      <div className={styles.head}>
        <h3 className={styles.title}>From A to B</h3>
        <Button onClick={onClose}>Close</Button>
      </div>
      <p className={styles.note}>Across all chapters</p>
      <div className={styles.selects}>
        {select('From', from, setFrom)}
        {select('To', to, setTo)}
        <Button
          onClick={() => {
            setFrom(to);
            setTo(from);
            setPicked(0);
          }}
        >
          Swap
        </Button>
      </div>
      {result === undefined ? null : !result.ok ? (
        <p role="status">{result.reason}</p>
      ) : chains.length === 0 ? (
        <p role="status">{outside && props.scopeName !== undefined ? `No chain within ${props.scopeName} in ${CHAIN_MAX_STEPS} steps or fewer.` : `No chain of ${CHAIN_MAX_STEPS} steps or fewer.`}</p>
      ) : (
        <>
          <ol className={styles.chains} aria-label="Chains">
            {shown.map((card, at) => (
              // one card per chain (step 8.3b, B2.1): a click anywhere on it chooses it; only the chosen card shows its step rows, each its own button
              <li key={card.key} className={styles.chain} data-picked={card.chosen ? '' : undefined} data-tone={card.chosen ? toneOf(card.key.split('>')[0] ?? '') : undefined} onClick={() => setPicked(at)}>
                <button type="button" className={styles.chainRow} aria-pressed={card.chosen} onClick={(event) => { event.stopPropagation(); setPicked(at); }}>
                  <span className={styles.chainTitle}>{card.title}</span>{' '}
                  {card.chosen ? <span className={styles.onMap}>On the map</span> : null}{' '}
                  <span className={styles.chainSummary}>{card.summary}</span>
                </button>
                {card.steps === undefined ? null : (
                  <ul className={styles.steps}>
                    {card.steps.map((step) => (
                      <li key={`${step.from}>${step.to}`}>
                        <button type="button" className={styles.step} onClick={(event) => { event.stopPropagation(); props.onOpenStep(step.from, step.to); }}>
                          <span>
                            {step.title}
                            {' · '}
                            {stepWords(step.from, step.to)}
                          </span>
                          <span aria-hidden="true" className={styles.stepGo}>›</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          {result.truncated ? <p className={styles.note}>The search stopped early: there may be more chains.</p> : null}
          {props.phone === true && chains.length > 1 ? <Button onClick={() => setExpanded((open) => !open)}>{expanded ? 'Show fewer' : `Show all ${chains.length}`}</Button> : null}
        </>
      )}
    </aside>
  );
}

/** The panel with the active exam scope read from the map's ports (the scope code stays out of the first load with the panel). */
export function ChainPanelInScope(props: Omit<ChainPanelProps, 'inScope' | 'scopeName'> & { readonly ports: NavigatorPorts }) {
  const { ports, ...rest } = props;
  const active = useStore(ports.ui.exam, (s) => s.active);
  const only = useScopeOnly(ports.ui.exam); // under Everything every reaction can be a step
  const inScope = useMemo(() => {
    if (active === null || !only) return undefined;
    const scopeOf = scopeLens(ports.indexes.current(), active);
    return (id: string): boolean => scopeOf({ kind: 'reaction', id } as RecordRef) !== 'outside';
  }, [ports, active, only]);
  const scopeName = useMemo(() => scopeNameOf(ports.store.getState(), active), [ports, active]);
  return <ChainPanel {...rest} inScope={inScope} scopeName={scopeName} />;
}
