/**
 * What a reaction is related to (step 5.6b, item c). Two parts: the relationships a person STORED (commonly confused with, reverse of,
 * and so on, read from the relationship records), and the groups DERIVED from the data by `relatedReactionsOf` (never stored): leads on
 * to, comes from, same transformation, same named family, shares a mechanism, same reagent family. A group shows its first 12 reactions
 * and "+N more" opens the whole list in a virtualised list. A link through a class is marked inferred and names the class.
 */
import { useMemo, useState } from 'react';
import { RELATED_GROUP_KEYS, relatedReactionsOf, MAX_GROUP_ITEMS, type RelatedGroup, type RelatedGroupKey } from '@/core/graph';
import type { Reaction, RecordRef, Relationship } from '@/core/schema';
import { RELATIONSHIP_TYPE_SPECS } from '@/core/schema';
import { useInspectorEnv } from './env';
import { RecordList } from './record-list';
import { RecordLink, RichText } from './rich-text';
import { words } from './view-parts';
import styles from './inspector.module.css';

export const GROUP_TITLES: Readonly<Record<RelatedGroupKey, string>> = {
  leads_on: 'Leads on to',
  comes_from: 'Comes from',
  same_transformation: 'Same transformation',
  same_named_family: 'Same named family',
  shares_mechanism: 'Shares a mechanism',
  same_reagent_family: 'Same reagent family',
};

/** Reactions listed before "+N more". */
export const GROUP_PREVIEW = 12;

type Row = { readonly kind: 'reaction'; readonly id: string; readonly via: RecordRef | undefined; readonly inferred: boolean };

const rowsOf = (group: RelatedGroup): Row[] => group.items.map((item) => ({ kind: 'reaction', id: item.reactionId, via: item.via, inferred: item.inferred }));

function Inferred(props: { readonly row: Row }) {
  if (!props.row.inferred) return null;
  return (
    <span className={styles.muted}>
      {' '}
      (inferred
      {props.row.via === undefined ? '' : ', through '}
      {props.row.via === undefined ? null : <RecordLink kind={props.row.via.kind} id={props.row.via.id} />})
    </span>
  );
}

function GroupBlock(props: { readonly group: RelatedGroup }) {
  const { group } = props;
  const [all, setAll] = useState(false);
  const title = GROUP_TITLES[group.key];
  const rows = rowsOf(group);
  const more = group.total - GROUP_PREVIEW;
  return (
    <section aria-label={title} data-group={group.key}>
      <h5 className={styles.subheading}>
        {title} ({group.total})
      </h5>
      {all ? (
        <RecordList label={title} items={rows} suffix={(row) => <Inferred row={row} />} />
      ) : (
        <ul aria-label={`${title}, first ${Math.min(GROUP_PREVIEW, group.total)}`}>
          {rows.slice(0, GROUP_PREVIEW).map((row) => (
            <li key={row.id}>
              <RecordLink kind={row.kind} id={row.id} />
              <Inferred row={row} />
            </li>
          ))}
        </ul>
      )}
      {more > 0 ? (
        <button type="button" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `+${more} more`}
        </button>
      ) : null}
      {group.total > group.items.length ? <p className={styles.muted}>The list is cut at {MAX_GROUP_ITEMS} of {group.total} reactions.</p> : null}
    </section>
  );
}

/** The relationships a person stored for `ref`, each with the other end in words ("commonly confused with Aldol reaction"). */
export function StoredRelationships(props: { readonly target: RecordRef }) {
  const env = useInspectorEnv();
  const rows = useMemo(() => {
    const out: { readonly kind: string; readonly id: string; readonly record: Relationship; readonly other: RecordRef }[] = [];
    for (const owner of env.ports.indexes.current().relationshipsOf(props.target)) {
      const record = (env.state.records.relationship as Readonly<Record<string, Relationship>>)[owner.id];
      if (record === undefined) continue;
      const other = record.from.id === props.target.id && record.from.kind === props.target.kind ? record.to : record.from;
      out.push({ kind: 'relationship', id: owner.id, record, other });
    }
    return out;
  }, [env, props.target]);
  if (rows.length === 0) return null;
  return (
    <section aria-label="Relationships written by a person">
      <h5 className={styles.subheading}>Relationships ({rows.length})</h5>
      <RecordList
        label="Relationships"
        items={rows.map((row) => ({ kind: row.other.kind, id: row.other.id, row }))}
        prefix={(item) => {
          const { record } = item.row;
          const spec = RELATIONSHIP_TYPE_SPECS[record.type];
          const forward = record.from.id === props.target.id && record.from.kind === props.target.kind;
          return <span>{forward ? spec.label : spec.inverseLabel} </span>;
        }}
        suffix={(item) => (
          <span className={styles.muted}>
            {item.row.record.reverseKind === undefined ? '' : ` (${words(item.row.record.reverseKind)} reverse)`}
            {item.row.record.note === undefined ? null : (
              <>
                {' '}
                <RichText source={item.row.record.note} />
              </>
            )}{' '}
            <RecordLink kind="relationship" id={item.row.id} label="record" />
          </span>
        )}
      />
    </section>
  );
}

export function RelatedReactions(props: { readonly reaction: Reaction }) {
  const env = useInspectorEnv();
  const groups = useMemo(() => relatedReactionsOf(env.ports.indexes.current(), props.reaction), [env, props.reaction]);
  const empty = groups.filter((group) => group.total === 0);
  return (
    <section aria-label="Related reactions">
      <h4>Related reactions</h4>
      <StoredRelationships target={{ kind: 'reaction', id: props.reaction.id } as RecordRef} />
      {groups
        .filter((group) => group.total > 0)
        .map((group) => (
          <GroupBlock key={group.key} group={group} />
        ))}
      {empty.length === 0 ? null : <p className={styles.muted}>None found for: {RELATED_GROUP_KEYS.filter((key) => empty.some((g) => g.key === key)).map((key) => GROUP_TITLES[key]).join(', ')}.</p>}
    </section>
  );
}
