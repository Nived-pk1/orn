/**
 * A search box for ONE species or class (step 7.2a D1, D3): the Study-safe substance search through the port, the hits as buttons. It is
 * used twice, for the compound to make and for "Start from". Text only; nothing is searched on an empty box, and a newer ask supersedes an
 * older answer.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { RecordRef } from '@/core/schema';
import type { PrecursorPorts, SubstanceHit } from './contracts';
import styles from './precursors-view.module.css';

const DEBOUNCE_MS = 100;

export function SubstanceSearch(props: {
  readonly label: string;
  /** The name of a hit's button: "Choose Propan-2-ol". */
  readonly hitName: (title: string) => string;
  readonly ports: Pick<PrecursorPorts, 'searchSubstances' | 'timers'>;
  readonly onPick: (ref: RecordRef) => void;
  /** Ids that are already chosen and so not offered again. */
  readonly skip?: ReadonlySet<string>;
}) {
  const { ports } = props;
  const [text, setText] = useState('');
  const [hits, setHits] = useState<readonly SubstanceHit[]>([]);
  const [message, setMessage] = useState('');
  const serial = useRef(0);
  const messageId = useId();
  useEffect(() => {
    const mine = (serial.current += 1);
    if (text.trim() === '') {
      setHits([]);
      setMessage('');
      return undefined;
    }
    return ports.timers.after(DEBOUNCE_MS, () => {
      void ports.searchSubstances(text.trim()).then((answer) => {
        if (mine !== serial.current) return;
        if (answer.ok) {
          setHits(answer.hits);
          setMessage(answer.hits.length === 0 ? 'No species or class matches.' : '');
        } else {
          setHits([]);
          setMessage(`Search is not available: ${answer.message}`);
        }
      });
    });
  }, [text, ports]);
  const shown = hits.filter((hit) => props.skip?.has(hit.ref.id) !== true);
  return (
    <div className={styles.searchBox}>
      <label className={styles.field}>
        <span>{props.label}</span>
        <input type="search" value={text} autoComplete="off" spellCheck={false} aria-describedby={message === '' ? undefined : messageId} onChange={(event) => setText(event.target.value)} />
      </label>
      {message === '' ? null : (
        <p id={messageId} className={styles.muted}>
          {message}
        </p>
      )}
      {shown.length === 0 ? null : (
        <ul className={styles.hits} aria-label={`${props.label}: matches`}>
          {shown.map((hit) => (
            <li key={`${hit.ref.kind}:${hit.ref.id}`}>
              <button
                type="button"
                aria-label={props.hitName(hit.title)}
                onClick={() => {
                  props.onPick(hit.ref);
                  setText('');
                }}
              >
                {hit.ref.kind === 'class' ? `${hit.title} (class)` : hit.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
