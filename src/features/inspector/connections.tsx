/**
 * What else points at a chemistry record, for its Level 4 (step 5.6b): the relationships a person stored, the caveats that name it as a
 * target, and its curriculum. A reaction shows its relationships with its related reactions at Level 3 instead (`RelatedReactions`).
 */
import { useMemo } from 'react';
import type { RecordRef } from '@/core/schema';
import { CurriculumFacts } from './curriculum-facts';
import { useInspectorEnv } from './env';
import { RecordList } from './record-list';
import { StoredRelationships } from './related';
import styles from './inspector.module.css';

export function CaveatsFor(props: { readonly target: RecordRef }) {
  const env = useInspectorEnv();
  const caveats = useMemo(() => env.ports.indexes.current().caveatsFor(props.target), [env, props.target]);
  if (caveats.length === 0) return null;
  return (
    <section aria-label="Caveats">
      <h5 className={styles.subheading}>Caveats ({caveats.length})</h5>
      <RecordList label="Caveats" items={caveats} />
    </section>
  );
}

export function Connections(props: { readonly target: RecordRef; readonly relationships?: boolean }) {
  return (
    <>
      {props.relationships === false ? null : <StoredRelationships target={props.target} />}
      <CaveatsFor target={props.target} />
      <CurriculumFacts target={props.target} />
    </>
  );
}
