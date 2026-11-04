/**
 * "From A to B" (step 8.2b, C2; a lazy chunk): choose two families and see the chains of at most three family-to-family steps that lead from
 * one to the other, across ALL chapters. The chosen chain (the first by default) is reported so the map draws only its arrows; a step opens
 * that arrow's reactions like selecting the arrow does. Esc and Close close it, and closing clears the chain. The search is
 * `familyChains` (core); this only chooses and lists. Not saved.
 */
import { useEffect, useMemo, useState } from 'react';
// deep import: the chain search is only for this lazy chunk (a barrel would pull it into the first load)
import { CHAIN_MAX_STEPS, familyChains, familyEdgesOf, type FamilyChain } from '@/core/graph/navigator/chains';
import { UNCLASSIFIED_HUB_ID } from '@/core/graph/navigator/hubs';
import { Button } from '@/ui/primitives';
import type { NamedFamily } from './find-family-match';
import type { PairFacts } from './map-chips';
import styles from './chain-panel.module.css';

type Steps = readonly { readonly from: string; readonly to: string }[];

export interface ChainPanelProps {
  readonly families: readonly NamedFamily[];
  /** The roll-up's pairs (asked when the panel needs them). */
  readonly pairs: () => readonly { readonly from: string; readonly to: string; readonly candidates: readonly { readonly reactionId: string }[] }[];
  readonly facts: (from: string, to: string) => PairFacts | undefined;
  /** The steps the map draws, or undefined (nothing chosen). */
  readonly onChain: (steps: Steps | undefined) => void;
  readonly onOpenStep: (from: string, to: string) => void;
  readonly onClose: () => void;
  readonly phone?: boolean;
}

export function ChainPanel(props: ChainPanelProps) {
  const { families, facts, onChain, onClose } = props;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [picked, setPicked] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const names = useMemo(() => new Map(families.map((f) => [f.id, f.name])), [families]);
  const nameOf = (id: string): string => names.get(id) ?? id;
  const edges = useMemo(() => familyEdgesOf(props.pairs(), new Set([UNCLASSIFIED_HUB_ID])), [props]);
  const result = useMemo(() => (from === '' || to === '' ? undefined : familyChains(edges, from, to, { maxSteps: CHAIN_MAX_STEPS, nameOf })), [edges, from, to, names]); // eslint-disable-line react-hooks/exhaustive-deps -- nameOf reads `names`
  const chains: readonly FamilyChain[] = result?.ok === true ? result.chains : [];
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
  const stepWords = (a: string, b: string): string => {
    const found = facts(a, b);
    if (found === undefined) return '';
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
  const shown = props.phone === true && !expanded ? chains.slice(0, 1) : chains;
  return (
    <aside className={styles.panel} aria-label="From A to B" data-phone={props.phone === true ? '' : undefined} data-expanded={expanded ? '' : undefined}>
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
        <p role="status">No chain of {CHAIN_MAX_STEPS} steps or fewer.</p>
      ) : (
        <>
          <ol className={styles.chains} aria-label="Chains">
            {shown.map((chain, at) => (
              <li key={chain.families.join('>')} className={styles.chain} data-picked={at === picked ? '' : undefined}>
                <button type="button" className={styles.chainRow} aria-pressed={at === picked} onClick={() => setPicked(at)}>
                  {chain.families.map(nameOf).join(' → ')}
                </button>
                <ul className={styles.steps}>
                  {chain.steps.map((step) => (
                    <li key={`${step.from}>${step.to}`}>
                      <button type="button" className={styles.step} onClick={() => props.onOpenStep(step.from, step.to)}>
                        {`${nameOf(step.from)} → ${nameOf(step.to)}: ${stepWords(step.from, step.to)}`}
                      </button>
                    </li>
                  ))}
                </ul>
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
