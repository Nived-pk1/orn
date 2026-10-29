/**
 * "Examples (n)" of a GENERIC reaction (7.2b A6; DOMAIN_MODEL §6.5): the specific reactions that point at it with `instanceOfId`, read from
 * the reverse index, one link each in folded-name order (then ID). Nothing is stored; a reaction nothing points at shows nothing.
 */
import { useMemo } from 'react';
import { fold } from '@/core/text/normalizer';
import type { Reaction } from '@/core/schema';
import { useInspectorEnv } from './env';
import { RecordList } from './record-list';
import styles from './inspector.module.css';

export function ReactionExamples(props: { readonly record: Reaction }) {
  const env = useInspectorEnv();
  const { record } = props;
  const examples = useMemo(() => {
    if (record.scope !== 'generic') return [];
    const ids = new Set(
      env.ports.indexes
        .current()
        .referrersOf(record.id)
        .filter((referrer) => referrer.owner.kind === 'reaction' && referrer.path === 'instanceOfId')
        .map((referrer) => referrer.owner.id),
    );
    const key = (id: string): string => fold(env.name({ kind: 'reaction', id }));
    return [...ids].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a < b ? -1 : 1)).map((id) => ({ kind: 'reaction' as const, id }));
  }, [env, record]);
  if (examples.length === 0) return null;
  return (
    <section aria-label="Examples">
      <h5 className={styles.subheading}>Examples ({examples.length})</h5>
      <RecordList label="Examples" items={examples} />
    </section>
  );
}
