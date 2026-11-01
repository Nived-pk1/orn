/**
 * The small parts the Named reactions and Mechanisms pages share (7.4 D, E): a "Label: a, b" line of links, the caveats section (title and
 * statement), the "In chapters:" line, the page header (back button, name, "also called ...") and the "Only <exam version>" box. Text is always a
 * React child. Rich text is drawn by the app's renderer (handed in).
 */
import { useEffect, useRef, type ReactNode } from 'react';
import styles from './study-page.module.css';

export interface LinkItem {
  readonly id: string;
  readonly name: string;
}

export function LinkLine(props: { readonly label: string; readonly items: readonly LinkItem[]; readonly onOpen: (id: string) => void }) {
  if (props.items.length === 0) return null;
  return (
    <p className={styles.facts} data-link-line={props.label}>
      {`${props.label}: `}
      {props.items.map((item, i) => (
        <span key={item.id}>
          {i > 0 ? ', ' : null}
          <button type="button" className={styles.linkButton} onClick={() => props.onOpen(item.id)}>
            {item.name}
          </button>
        </span>
      ))}
    </p>
  );
}

export function CaveatSection(props: { readonly caveats: readonly { readonly id: string; readonly title: string; readonly statement: string }[]; readonly renderRichText: (source: string | undefined) => ReactNode; readonly onOpen: (id: string) => void }) {
  if (props.caveats.length === 0) return null;
  return (
    <section className={styles.section} aria-label="Caveats and traps">
      <h3 className={styles.sectionHeading}>Caveats and traps</h3>
      <ul className={styles.caveats}>
        {props.caveats.map((caveat) => (
          <li key={caveat.id}>
            <button type="button" className={styles.linkButton} onClick={() => props.onOpen(caveat.id)}>
              {caveat.title}
            </button>
            <div>{props.renderRichText(caveat.statement)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ChaptersLine(props: { readonly chapters: readonly LinkItem[]; readonly onOpen: (id: string) => void; readonly none: string }) {
  return (
    <p className={styles.facts} data-in-chapters="">
      {'In chapters: '}
      {props.chapters.length === 0
        ? props.none
        : props.chapters.map((chapter, i) => (
            <span key={chapter.id}>
              {i > 0 ? ', ' : null}
              <button type="button" className={styles.linkButton} onClick={() => props.onOpen(chapter.id)}>
                {chapter.name}
              </button>
            </span>
          ))}
    </p>
  );
}

/** The page header: "All <things>" back button, the name as the focused heading, and "also called ..." under it. */
export function PageHeader(props: { readonly backLabel: string; readonly onBack: () => void; readonly name: string; readonly aliases: readonly string[]; readonly focusKey: string; readonly extra?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [props.focusKey]);
  return (
    <>
      <header className={styles.header}>
        <button type="button" onClick={props.onBack}>
          {props.backLabel}
        </button>
        <h2 ref={heading} tabIndex={-1} className={styles.title}>
          {props.name}
        </h2>
        {props.extra}
      </header>
      {props.aliases.length === 0 ? null : <p className={styles.muted}>{`also called ${props.aliases.join(', ')}`}</p>}
    </>
  );
}

export function ScopeBox(props: { readonly versionName: string | undefined; readonly checked: boolean; readonly onChange: (on: boolean) => void }) {
  if (props.versionName === undefined) return null;
  return (
    <label className={styles.option}>
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
      <span>{`Only ${props.versionName}`}</span>
    </label>
  );
}
