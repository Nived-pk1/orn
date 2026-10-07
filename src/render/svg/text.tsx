/**
 * Text of the drawing (step 5.4a): one `<tspan>` per run, sub and superscripts by class and a baseline shift, text nodes only (a
 * run's text is a React child, never markup; SECURITY §2). The shift is a numeric `dy` in user units, so it works in every browser:
 * a run moves by the difference to the previous run's shift and the line returns to its baseline.
 */
import type { ReactNode } from 'react';
import type { FormattedText, TextRun } from '@/render/scene';
import styles from './scene-svg.module.css';

const SUB_SHIFT = 0.25;
const SUP_SHIFT = -0.4;

const shiftOf = (run: TextRun, size: number): number => (run.script === 'sub' ? size * SUB_SHIFT : run.script === 'sup' ? size * SUP_SHIFT : 0);

const classOf = (run: TextRun): string | undefined => {
  const names = [run.script === undefined ? undefined : styles.script, run.emphasis === 'strong' ? styles.strong : run.emphasis === 'em' ? styles.em : undefined].filter((name): name is string => name !== undefined);
  return names.length === 0 ? undefined : names.join(' ');
};

/** The runs as tspans, for the inside of a `<text>` whose font size is `size`. */
export function Runs(props: { readonly runs: FormattedText; readonly size: number }): ReactNode {
  let previous = 0;
  return props.runs.map((run, index) => {
    const shift = shiftOf(run, props.size);
    const dy = shift - previous;
    previous = shift;
    return (
      // Runs have no identity; the list is replaced as a whole, so the index is the key.
      <tspan key={index} className={classOf(run)} {...(dy === 0 ? {} : { dy })}>
        {run.text}
      </tspan>
    );
  });
}

/** The characters of a text, no styling: a `<title>`, an accessible name. */
export const plainText = (runs: FormattedText): string => runs.map((run) => run.text).join('');
