/**
 * A summary line ("Base-catalysed · 3 steps · In dilute alkali") with each part that " · " separates in its own element, so a line that has to
 * wrap moves a whole part ("3 steps") to the next line and never splits one (step 6.5a review F3). The text is unchanged.
 */
import { Fragment } from 'react';
import styles from './step-fields.module.css';

const SEPARATOR = ' · ';

export function SummaryLine(props: { readonly text: string }) {
  if (props.text === '') return null;
  return (
    <>
      {props.text.split(SEPARATOR).map((part, index) => (
        // a summary has a handful of parts that never reorder: the index is a stable key
        <Fragment key={index}>
          {index === 0 ? '' : SEPARATOR}
          <span className={styles.part} data-summary-part="">
            {part}
          </span>
        </Fragment>
      ))}
    </>
  );
}
