/**
 * Quick entry (ADR-040 addendum, step 6.7b, Q1): one text line - "ethanol + PCC (CH2Cl2) -> ethanal" - three examples under it and the review
 * below it. The line is parsed by the core grammar; each term is resolved through the port (never guessed); the review shows every term's state,
 * the condition text, the scope and the live preview; "Open in the reaction editor" opens a NEW reaction draft. Nothing is saved here. The
 * typed line is handed back through `onLine` so closing the dialog keeps it for the session. Loaded with `React.lazy` (its own chunk).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseQuickEntry } from '@/core/quick-entry/grammar';
import { conditionItems, type QuickRefs, type TermRef } from '@/core/quick-entry/seed';
import type { RecordRef } from '@/core/schema';
import { Dialog } from '@/ui/primitives';
import { Button } from '@/ui/primitives';
import { nameSeed } from './create-new';
import type { QuickEntryPort } from './quick-entry-contracts';
import { QuickReview } from './quick-entry-review';
import { resolvedFrom, resolveTerm, speciesOfItem, type TermState } from './quick-resolve';
import type { RecordChoice } from './record-picker-contracts';
import styles from './quick-entry.module.css';

export const QUICK_EXAMPLES: readonly string[] = ['ethanol + PCC (CH2Cl2) -> ethanal', 'CH3MgBr + ethanal, then H3O+ -> propan-2-ol', 'CC(=O)O + CCO -> CC(=O)OCC + H2O'];

const LOADING: TermState = { state: 'loading' };

export interface QuickEntryDialogProps {
  readonly port: QuickEntryPort;
  /** The line typed before (kept for the session when the dialog is closed). */
  readonly initialLine: string;
  readonly onLine: (line: string) => void;
  readonly onClose: () => void;
}

export function QuickEntryDialog(props: QuickEntryDialogProps) {
  const { port } = props;
  const [line, setLine] = useState(props.initialLine);
  const [found, setFound] = useState<Readonly<Record<string, TermState>>>({});
  const [picked, setPicked] = useState<Readonly<Record<string, TermState>>>({});
  const [solvents, setSolvents] = useState<Readonly<Record<string, TermRef | null>>>({});
  const [scopeChoice, setScopeChoice] = useState<'specific' | 'generic' | null>(null);
  const asked = useRef(new Set<string>());
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const parsed = useMemo(() => parseQuickEntry(line), [line]);
  const entry = parsed.ok ? parsed.entry : undefined;
  const texts = useMemo(() => (entry === undefined ? [] : [...new Set([...entry.stages.flatMap((stage) => stage.terms), ...entry.products].map((term) => term.text))]), [entry]);

  useEffect(() => {
    for (const text of texts) {
      if (asked.current.has(text)) continue;
      asked.current.add(text);
      void resolveTerm(text, port).then((state) => {
        if (live.current) setFound((was) => ({ ...was, [text]: state }));
      });
    }
  }, [texts, port]);

  const items = useMemo(() => (entry === undefined ? [] : conditionItems(entry)), [entry]);
  useEffect(() => {
    for (const item of items) {
      const key = `item:${item}`;
      if (asked.current.has(key)) continue;
      asked.current.add(key);
      void speciesOfItem(item, port).then((ref) => {
        if (live.current) setSolvents((was) => ({ ...was, [item]: ref ?? null }));
      });
    }
  }, [items, port]);
  const named = useMemo(() => Object.fromEntries(Object.entries(solvents).filter((one): one is [string, TermRef] => one[1] !== null)), [solvents]);

  const stateOf = useCallback((text: string): TermState => picked[text] ?? found[text] ?? LOADING, [picked, found]);
  const refs: QuickRefs | undefined = useMemo(() => {
    if (entry === undefined) return undefined;
    const refOf = (text: string) => {
      const state = picked[text] ?? found[text];
      return state?.state === 'resolved' ? state.ref : undefined;
    };
    return { stages: entry.stages.map((stage) => stage.terms.map((term) => refOf(term.text))), products: entry.products.map((term) => refOf(term.text)) };
  }, [entry, picked, found]);

  const change = (next: string): void => {
    setLine(next);
    props.onLine(next);
  };
  const choose = (text: string, choice: RecordChoice): void => setPicked((was) => ({ ...was, [text]: resolvedFrom(choice, 'chosen') }));
  const create = (text: string, kind: 'species' | 'reagent', withStructure: boolean): void => {
    const seed = { ...nameSeed(kind, withStructure ? '' : text), ...(withStructure ? { structure: { format: 'smiles', value: text } } : {}) };
    port.createNew(kind, seed, (ref: RecordRef) => {
      const choice = port.describe({ kind: ref.kind as 'species' | 'reagent', id: ref.id });
      if (choice !== undefined && live.current) choose(text, choice);
    });
  };

  return (
    <Dialog open onClose={props.onClose} title="Quick entry" size="wide" initialFocus='input[type="text"]'>
      <div className={styles.dialog}>
        <label>
          <span className={styles.hint}>Type the reaction on one line: reactants + reactants -&gt; products. Text in ( ) after a term is its condition; &quot;, then&quot; starts the next stage.</span>
          <input className={styles.line} type="text" aria-label="Reaction line" value={line} onChange={(event) => change(event.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        <div>
          <p className={styles.hint}>Examples</p>
          <ul className={styles.examples} aria-label="Examples">
            {QUICK_EXAMPLES.map((example) => (
              <li key={example}>
                <Button onClick={() => change(example)}>{example}</Button>
              </li>
            ))}
          </ul>
        </div>
        {!parsed.ok && line.trim() !== '' ? (
          <ul className={styles.problems} aria-label="Problems with the line" aria-live="polite">
            {parsed.errors.map((error, index) => (
              <li key={index}>{`Character ${error.position + 1}: ${error.message}`}</li>
            ))}
          </ul>
        ) : null}
        {entry === undefined || refs === undefined ? null : (
          <QuickReview
            entry={entry}
            port={port}
            stateOf={stateOf}
            refs={refs}
            solvents={named}
            onChoose={choose}
            onCreate={create}
            scopeChoice={scopeChoice}
            onScope={setScopeChoice}
            onOpen={(seed) => {
              port.open(seed);
              props.onClose();
            }}
          />
        )}
      </div>
    </Dialog>
  );
}
