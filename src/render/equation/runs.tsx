/**
 * Text runs in HTML: sub and superscripts are real elements, a run's text is always a React child (never markup; SECURITY §2). The one
 * place the equation, the cards and the inspector set formulas and arrow text.
 */
import type { ReactNode } from 'react';
import type { FormattedText } from '@/render/scene';

export function Runs(props: { readonly runs: FormattedText }): ReactNode {
  return props.runs.map((run, index) => {
    // Runs have no identity; the list is replaced as a whole, so the index is the key.
    const text = run.emphasis === 'strong' ? <strong>{run.text}</strong> : run.emphasis === 'em' ? <em>{run.text}</em> : run.text;
    if (run.script === 'sub') return <sub key={index}>{text}</sub>;
    if (run.script === 'sup') return <sup key={index}>{text}</sup>;
    return <span key={index}>{text}</span>;
  });
}
