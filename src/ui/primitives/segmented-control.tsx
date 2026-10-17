import { useId, useRef, useState } from 'react';
import { VisuallyHidden } from './visually-hidden';
import styles from './segmented-control.module.css';

export interface SegmentedOption<V extends string> {
  readonly value: V;
  readonly label: string;
}

export interface SegmentedControlProps<V extends string> {
  /** The group's name, said by a screen reader and used to announce a change: "Structures: Condensed". */
  readonly label: string;
  readonly options: readonly SegmentedOption<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
}

/**
 * One choice among a few, side by side. Real radio buttons in one group: the browser makes the group ONE tab stop (no tabindex is set
 * here), moves and chooses with the arrow keys (wrapping), and says "n of 3". A change of `value` after the first render is announced
 * in words in a status region ("Structures: Condensed").
 */
export function SegmentedControl<V extends string>(props: SegmentedControlProps<V>) {
  const { label, options, value, onChange } = props;
  const name = useId();
  const [said, setSaid] = useState('');
  const last = useRef(value);
  if (last.current !== value) {
    last.current = value;
    const now = options.find((option) => option.value === value);
    if (now !== undefined) setSaid(`${label}: ${now.label}`);
  }
  return (
    <div className={styles.group}>
      <div role="radiogroup" aria-label={label} className={styles.segments}>
        {options.map((option) => (
          <label key={option.value} className={option.value === value ? `${styles.segment} ${styles.chosen}` : styles.segment}>
            <input type="radio" name={name} value={option.value} checked={option.value === value} className={styles.input} onChange={() => option.value !== value && onChange(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <VisuallyHidden>
        <span role="status">{said}</span>
      </VisuallyHidden>
    </div>
  );
}
