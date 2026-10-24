/**
 * The Substance filter's body (step 7.1b D2): a search box (the Study-safe substance search: species, classes, reagents only), the chosen
 * substances, the hits as checkboxes (a hit that no reaction uses is not listed unless chosen), then "Used as". Text only; the port searches.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { EXPLORER_USES, type ExplorerFilter, type ExplorerUse } from '@/ui/state';
import type { ExplorerPorts, SubstanceHit } from './contracts';
import { USE_WORDS, type Labels } from './model';
import styles from './reactions-view.module.css';

const DEBOUNCE_MS = 100;

export function SubstancePicker(props: {
  readonly ports: Pick<ExplorerPorts, 'searchSubstances' | 'timers'>;
  readonly filter: ExplorerFilter;
  readonly labels: Labels;
  /** Reactions per substance id under the other filters (the facet); a substance not in it has none. */
  readonly counts: ReadonlyMap<string, number>;
  readonly onChange: (patch: Partial<ExplorerFilter>) => void;
}) {
  const { ports, filter } = props;
  const [text, setText] = useState('');
  const [hits, setHits] = useState<readonly SubstanceHit[]>([]);
  const [message, setMessage] = useState('');
  const serial = useRef(0);
  const name = useId();
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
          setMessage(answer.hits.length === 0 ? 'No species, class or reagent matches.' : '');
        } else {
          setHits([]);
          setMessage(`Search is not available: ${answer.message}`);
        }
      });
    });
  }, [text, ports]);
  const toggle = (id: string): void => props.onChange({ substanceIds: filter.substanceIds.includes(id) ? filter.substanceIds.filter((one) => one !== id) : [...filter.substanceIds, id] });
  const listed = hits.filter((hit) => filter.substanceIds.includes(hit.ref.id) || (props.counts.get(hit.ref.id) ?? 0) > 0);
  return (
    <div className={styles.picker}>
      <label className={styles.field}>
        <span>Find a species, class or reagent</span>
        <input type="search" value={text} autoComplete="off" spellCheck={false} onChange={(event) => setText(event.target.value)} />
      </label>
      {filter.substanceIds.length === 0 ? null : (
        <ul className={styles.chosenList} aria-label="Chosen substances">
          {filter.substanceIds.map((id) => (
            <li key={id}>
              <label className={styles.option}>
                <input type="checkbox" checked onChange={() => toggle(id)} />
                <span>{props.labels.substance(id)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {listed.length === 0 ? null : (
        <ul className={styles.chosenList} aria-label="Matches">
          {listed
            .filter((hit) => !filter.substanceIds.includes(hit.ref.id))
            .map((hit) => (
              <li key={hit.ref.id}>
                <label className={styles.option}>
                  <input type="checkbox" checked={false} onChange={() => toggle(hit.ref.id)} />
                  <span>{`${hit.title} (${props.counts.get(hit.ref.id) ?? 0})`}</span>
                </label>
              </li>
            ))}
        </ul>
      )}
      {message === '' ? (text.trim() !== '' && hits.length > 0 && listed.length === 0 ? <p className={styles.muted}>No reaction uses what matches.</p> : null) : <p className={styles.muted}>{message}</p>}
      <fieldset className={styles.options}>
        <legend>Used as</legend>
        {EXPLORER_USES.map((use: ExplorerUse) => (
          <label key={use} className={styles.option}>
            <input type="radio" name={name} checked={filter.usedAs === use} onChange={() => props.onChange({ usedAs: use })} />
            <span>{USE_WORDS[use]}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
