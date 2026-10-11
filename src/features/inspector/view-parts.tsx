/** Small pieces the kind views share (step 5.6a): a row of record links, a labelled rich-text note, citations and tags. */
import type { ReactNode } from 'react';
import { Facts } from './levels';
import { RecordLink, RichText } from './rich-text';

type Ref = { readonly kind: string; readonly id: string };

export function Links(props: { readonly refs: readonly Ref[] }) {
  return (
    <>
      {props.refs.map((ref, index) => (
        <span key={`${ref.kind}:${ref.id}:${index}`}>
          {index > 0 ? ', ' : ''}
          <RecordLink kind={ref.kind} id={ref.id} />
        </span>
      ))}
    </>
  );
}

/** A fact with record links; nothing when the list is empty. */
export const LinkFact = (props: { readonly label: string; readonly refs: readonly Ref[] }): ReactNode =>
  props.refs.length === 0 ? null : (
    <Facts label={props.label}>
      <Links refs={props.refs} />
    </Facts>
  );

export const TextFact = (props: { readonly label: string; readonly value: ReactNode | undefined }): ReactNode =>
  props.value === undefined || props.value === '' ? null : <Facts label={props.label}>{props.value}</Facts>;

export const NoteFact = (props: { readonly label: string; readonly source: string | undefined }): ReactNode =>
  props.source === undefined || props.source === '' ? null : (
    <Facts label={props.label}>
      <RichText source={props.source} />
    </Facts>
  );

/** A labelled note INSIDE a fact's value (a `dd` cannot hold another `dt`): the label, then the rich text, as a block. */
export const InlineNote = (props: { readonly label: string; readonly source: string | undefined }): ReactNode =>
  props.source === undefined || props.source === '' ? null : (
    <div>
      <span>{props.label}: </span>
      <RichText source={props.source} />
    </div>
  );

export const words = (value: unknown): string => String(value).replaceAll('_', ' ');

export function CitationsAndTags(props: {
  readonly citations: readonly { readonly referenceId: string; readonly locator?: string; readonly note?: string }[];
  readonly tags: readonly string[];
}) {
  return (
    <>
      {props.citations.length === 0 ? null : (
        <Facts label="Citations">
          {props.citations.map((citation, index) => (
            <span key={index}>
              {index > 0 ? '; ' : ''}
              <RecordLink kind="reference" id={citation.referenceId} />
              {citation.locator === undefined ? '' : `, ${citation.locator}`}
              {citation.note === undefined ? '' : ` (${citation.note})`}
            </span>
          ))}
        </Facts>
      )}
      <TextFact label="Tags" value={props.tags.length === 0 ? undefined : props.tags.join(', ')} />
    </>
  );
}
