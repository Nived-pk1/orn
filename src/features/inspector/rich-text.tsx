/**
 * Rich text in the inspector (step 5.6a; DOMAIN_MODEL §3.4, SECURITY §2, ADV-033 inspector part). The mini-markup AST becomes React
 * elements: only text nodes, `strong`, `em`, `sub`, `sup`, paragraphs and bullet lists; the text is always a React child, never markup.
 * A record link opens that record in the inspector; a link to a record that is not there says "missing record <id>" in words. A URL
 * is a link only when it is a SafeUrl (http or https, no credentials): `target="_blank"` with `rel="noopener noreferrer"`; any other
 * (a `javascript:` URL) is plain text. The parser is total and bounded (core/text), so nothing here can run away.
 */
import type { ReactNode } from 'react';
import { isSafeHttpUrl } from '@/core/schema';
import type { RichNode } from '@/core/text';
import { parseRichText } from '@/core/text';
import { useInspectorEnv } from './env';
import styles from './inspector.module.css';

export function RecordLink(props: { readonly kind: string; readonly id: string; readonly label?: string }) {
  const env = useInspectorEnv();
  const ref = { kind: props.kind, id: props.id } as Parameters<typeof env.open>[0];
  if (!env.exists(ref)) {
    return (
      <span className={styles.missing} data-missing="">
        {props.label === undefined || props.label === '' ? '' : `${props.label}, `}missing record {props.id}
      </span>
    );
  }
  const label = props.label === undefined || props.label === '' ? env.name(ref) : props.label;
  return (
    <a
      href={`#${props.id}`}
      className={styles.recordLink}
      data-record-id={props.id}
      onClick={(event) => {
        event.preventDefault();
        env.open(ref);
      }}
    >
      {label}
    </a>
  );
}

/** A link to a web page, only when the URL is a SafeUrl; otherwise the text alone. */
export function ExternalLink(props: { readonly url: string; readonly children?: ReactNode }) {
  const shown = props.children ?? props.url;
  if (!isSafeHttpUrl(props.url)) return <span data-unsafe-url="">{shown}</span>;
  return (
    <a href={props.url} target="_blank" rel="noopener noreferrer" className={styles.recordLink}>
      {shown}
    </a>
  );
}

function Nodes(props: { readonly nodes: readonly RichNode[] }) {
  return (
    <>
      {props.nodes.map((node, index) => (
        <Node key={index} node={node} />
      ))}
    </>
  );
}

function Node(props: { readonly node: RichNode }): ReactNode {
  const { node } = props;
  switch (node.type) {
    case 'text':
      return node.text;
    case 'strong':
      return (
        <strong>
          <Nodes nodes={node.children} />
        </strong>
      );
    case 'em':
      return (
        <em>
          <Nodes nodes={node.children} />
        </em>
      );
    case 'sub':
      return <sub>{node.text}</sub>;
    case 'sup':
      return <sup>{node.text}</sup>;
    case 'link':
      return <RecordLink kind={node.target.kind} id={node.target.id} label={node.label} />;
    case 'paragraph':
      return (
        <p>
          <Nodes nodes={node.children} />
        </p>
      );
    case 'bullets':
      return (
        <ul>
          {node.items.map((item, index) => (
            <li key={index}>
              <Nodes nodes={item} />
            </li>
          ))}
        </ul>
      );
  }
}

export function RichText(props: { readonly source: string | undefined }) {
  if (props.source === undefined || props.source === '') return null;
  return (
    <div className={styles.rich}>
      <Nodes nodes={parseRichText(props.source)} />
    </div>
  );
}
