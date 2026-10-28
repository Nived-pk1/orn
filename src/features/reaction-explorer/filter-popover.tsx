/**
 * A filter's popover and its checkbox list (step 7.1b D2). The button names the filter and how many values are chosen; it opens a panel
 * under it (aria-expanded), Escape or a click outside closes it and the focus returns to the button. Native checkboxes, so the keyboard
 * and a screen reader work as everywhere. There is no popover primitive in src/ui, so this is the feature's own.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import styles from './reactions-view.module.css';

export interface FilterOption {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

export function FilterPopover(props: { readonly title: string; readonly chosen: number; readonly children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent): void => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false);
    };
    // Escape works wherever the focus is (WebKit does not focus a checkbox that was clicked) and closes ONLY this popover: the listener is on
    // the window in the capture phase and stops the key press there, so the inspector or another layer never sees the same press (step 7.2a)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <div ref={root} className={styles.popoverRoot}>
      <button ref={button} type="button" className={styles.filterButton} data-filter-title={props.title} aria-expanded={open} aria-controls={open ? panelId : undefined} aria-haspopup="true" onClick={() => setOpen((value) => !value)}>
        {props.chosen > 0 ? `${props.title} (${props.chosen})` : props.title}
      </button>
      {open ? (
        <div id={panelId} className={styles.popover} role="group" aria-label={`${props.title} filter`}>
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

export function OptionList(props: { readonly title: string; readonly options: readonly FilterOption[]; readonly chosen: readonly string[]; readonly onToggle: (id: string) => void }) {
  if (props.options.length === 0) return <p className={styles.muted}>No options match the other filters.</p>;
  return (
    <fieldset className={styles.options}>
      <legend className={styles.srOnly}>{props.title}</legend>
      {props.options.map((option) => (
        <label key={option.id} className={styles.option}>
          <input type="checkbox" checked={props.chosen.includes(option.id)} onChange={() => props.onToggle(option.id)} />
          <span>{`${option.label} (${option.count})`}</span>
        </label>
      ))}
    </fieldset>
  );
}
