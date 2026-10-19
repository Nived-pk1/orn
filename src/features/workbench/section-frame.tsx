/**
 * A collapsible editor section (UI_ARCHITECTURE §7, step 6.2a part 4): a heading whose button opens and closes it (`aria-expanded`),
 * Arrow Up / Down / Home / End move between the section headings of the form, and a closed section keeps its fields in the page (hidden),
 * so a finding can still name them: the host opens the section before it moves the focus there. Text only; no rules.
 */
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import styles from './editor.module.css';

export interface SectionFrameProps {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
  /** Starts open (default). A phone starts with the long sections closed. */
  readonly initiallyOpen?: boolean;
}

/** Moves the focus along the headings of the form: `step` -1 / +1, or 'first' / 'last'. */
function moveAmongHeadings(from: HTMLElement, step: -1 | 1 | 'first' | 'last'): void {
  const root = from.closest('[data-editor-sections]') ?? document;
  const buttons = Array.from(root.querySelectorAll<HTMLElement>('button[data-section-toggle]'));
  const at = buttons.indexOf(from);
  const next = step === 'first' ? 0 : step === 'last' ? buttons.length - 1 : at + step;
  buttons[Math.min(Math.max(next, 0), buttons.length - 1)]?.focus();
}

export function SectionFrame(props: SectionFrameProps) {
  const [open, setOpen] = useState(props.initiallyOpen !== false);
  const bodyId = useId();
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : undefined;
    if (step === undefined) return;
    event.preventDefault();
    moveAmongHeadings(event.currentTarget, step);
  };
  return (
    <section className={styles.section} aria-label={props.title} data-section={props.id}>
      <h3 className={styles.sectionHeading}>
        <button type="button" data-section-toggle="" className={styles.sectionToggle} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)} onKeyDown={onKeyDown}>
          <span aria-hidden="true">{open ? '▾' : '▸'}</span> {props.title}
        </button>
      </h3>
      <div id={bodyId} hidden={!open} data-collapsed={open ? undefined : 'true'}>
        {props.children}
      </div>
    </section>
  );
}
