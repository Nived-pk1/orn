/**
 * The rich-text field (step 6.5a, decision D1): ONE component for every mini-markup field (DOMAIN_MODEL §3.4). A plain textarea (the
 * text is stored EXACTLY as typed: no trimming, no rewriting), a live preview under it through the core parser (the AST becomes React
 * elements; a text node is always a React child, never markup, so typed HTML shows as text), and a one-line help. A [[link]] to a record
 * that is not there says so in words in the preview; the REF-008 warning is the finding (never a block). Text only; no rules here.
 */
import { useDeferredValue, useId } from 'react';
import type { RecordRef } from '@/core/schema';
import { parseRichText, type RichNode } from '@/core/text';
import styles from './rich-text-field.module.css';

export const RICH_TEXT_HELP = '*emphasis*, **strong**, H_{2}O, Br^{-}, - bullet, [[record link]]';

export interface RichTextFieldProps {
  readonly id: string;
  readonly label: string;
  /** The field path, for `data-field-path` (the host marks and focuses the field from a finding). */
  readonly path: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly invalid?: boolean;
  /** Why editing is unavailable (a read-only tab); absent: it is available. */
  readonly unavailable?: string | undefined;
  readonly phone?: boolean | undefined;
  /** Whether the record a [[link]] names exists; absent: links are not checked in the preview. */
  readonly linkExists?: ((ref: RecordRef) => boolean) | undefined;
  /** The name of the record a [[link]] names, shown for a link with no label (as the inspector does); absent: the record's ID. */
  readonly linkName?: ((ref: RecordRef) => string | undefined) | undefined;
  readonly rows?: number;
}

/** What the preview may ask about a [[link]]: whether its record exists, and its name. */
interface Links {
  readonly exists: RichTextFieldProps['linkExists'];
  readonly name: RichTextFieldProps['linkName'];
}

function Nodes(props: { readonly nodes: readonly RichNode[]; readonly links: Links }) {
  return (
    <>
      {props.nodes.map((node, index) => (
        <Node key={index} node={node} links={props.links} />
      ))}
    </>
  );
}

function Node(props: { readonly node: RichNode; readonly links: Links }) {
  const { node, links } = props;
  switch (node.type) {
    case 'text':
      return <>{node.text}</>;
    case 'strong':
      return (
        <strong>
          <Nodes nodes={node.children} links={links} />
        </strong>
      );
    case 'em':
      return (
        <em>
          <Nodes nodes={node.children} links={links} />
        </em>
      );
    case 'sub':
      return <sub>{node.text}</sub>;
    case 'sup':
      return <sup>{node.text}</sup>;
    case 'link': {
      // the parser gives a link with no label the ID as its label
      const unlabelled = node.label === '' || node.label === node.target.id;
      const label = unlabelled ? (links.name?.(node.target) ?? node.target.id) : node.label;
      if (links.exists !== undefined && !links.exists(node.target)) {
        return (
          <span className={styles.missing} data-missing="">
            {node.label === '' ? '' : `${node.label}, `}missing record {node.target.id}
          </span>
        );
      }
      return (
        <span className={styles.link} data-record-id={node.target.id}>
          {label}
        </span>
      );
    }
    case 'paragraph':
      return (
        <p>
          <Nodes nodes={node.children} links={links} />
        </p>
      );
    case 'bullets':
      return (
        <ul>
          {node.items.map((item, index) => (
            <li key={index}>
              <Nodes nodes={item} links={links} />
            </li>
          ))}
        </ul>
      );
  }
}

export function RichTextField(props: RichTextFieldProps) {
  const helpId = useId();
  const locked = props.unavailable !== undefined;
  // the preview may lag a keystroke behind on a long text; the textarea itself never does
  const shown = useDeferredValue(props.value);
  return (
    <div className={styles.field} data-rich-field="" data-phone={props.phone === true ? 'true' : undefined}>
      <label htmlFor={props.id}>{props.label}</label>
      <textarea
        id={props.id}
        className={styles.input}
        rows={props.rows ?? 4}
        value={props.value}
        readOnly={locked}
        aria-invalid={props.invalid === true ? true : undefined}
        aria-describedby={helpId}
        data-field-path={props.path}
        spellCheck={false}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <p id={helpId} className={styles.help}>{RICH_TEXT_HELP}</p>
      <div className={styles.preview} role="region" aria-label={`Preview of ${props.label}`}>
        {shown === '' ? <p className={styles.empty}>Nothing to preview.</p> : <Nodes nodes={parseRichText(shown)} links={{ exists: props.linkExists, name: props.linkName }} />}
      </div>
    </div>
  );
}
