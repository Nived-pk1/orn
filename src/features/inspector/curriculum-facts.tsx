/**
 * Level 4 curriculum of a chemistry record (step 5.6b, item h): the topics it is mapped to, and for EVERY exam version in the data its
 * derived scope in words (official, prerequisite, enrichment, outside, or unmapped) with the reason (an override record, or the mapped
 * topics with the version's coverage of each) and the version's status (provisional versions say "provisional, not verified"). The scope
 * is `createScopeOf`'s answer, the reason comes from `explainScope`; both are derived and never stored.
 */
import { useMemo } from 'react';
import { explainScope, referencing, type ScopeExplanation } from '@/core/graph';
import type { Exam, ExamVersion, RecordRef, TopicMapping } from '@/core/schema';
import { useInspectorEnv } from './env';
import { RecordLink, RichText } from './rich-text';
import { words } from './view-parts';
import styles from './inspector.module.css';

/** Most exam versions explained for one record (a dataset has a handful; this keeps the render bounded). */
const MAX_VERSIONS = 50;

export const SCOPE_WORDS: Readonly<Record<ScopeExplanation['scope'], string>> = {
  official: 'official: in the syllabus',
  prerequisite: 'prerequisite: needed for something in the syllabus',
  enrichment: 'enrichment: beyond the syllabus, useful',
  outside: 'outside the syllabus',
  unmapped: 'unmapped: no topic and no override says anything about it',
};

export const statusWords = (status: ExamVersion['status']): string => (status === 'official' ? 'official' : status === 'provisional' ? 'provisional, not verified' : 'draft, not verified');

const COVERAGE_WORDS = { included: 'included', partial: 'partly included', excluded: 'excluded', 'not listed': 'not listed' } as const;

function Reason(props: { readonly why: ScopeExplanation }) {
  const { why } = props;
  if (why.reason === 'override') {
    return (
      <>
        an exam relevance record decides it (
        {why.overrideIds.map((id, index) => (
          <span key={id}>
            {index > 0 ? ', ' : ''}
            <RecordLink kind="exam_relevance" id={id} />
          </span>
        ))}
        )
      </>
    );
  }
  if (why.reason === 'mapped') {
    return (
      <>
        from its topics:{' '}
        {why.topics.map((topic, index) => (
          <span key={topic.topicId}>
            {index > 0 ? '; ' : ''}
            <RecordLink kind="topic" id={topic.topicId} />
            {topic.mapped ? '' : ' (a parent of a mapped topic)'}, {COVERAGE_WORDS[topic.coverage]} in this version
          </span>
        ))}
      </>
    );
  }
  if (why.reason === 'prerequisite') return <>it is a prerequisite of a record that is official in this version</>;
  return <>it is mapped to no topic and no override names it</>;
}

export function CurriculumFacts(props: { readonly target: RecordRef }) {
  const env = useInspectorEnv();
  const { target } = props;
  const data = useMemo(() => {
    const indexes = env.ports.indexes.current();
    const mappings = referencing(indexes, target, 'target', 'topic_mapping')
      .map((owner) => indexes.get(owner.id))
      .filter((m): m is TopicMapping => m?.kind === 'topic_mapping');
    const versions = (Object.values(env.state.records.exam_version) as ExamVersion[]).sort((a, b) => (a.id < b.id ? -1 : 1));
    const shown = versions.slice(0, MAX_VERSIONS);
    return { mappings, versions: shown, omitted: versions.length - shown.length, explained: shown.map((version) => explainScope(indexes, target, version)) };
  }, [env, target]);
  const exams = env.state.records.exam as Readonly<Record<string, Exam>>;
  return (
    <section aria-label="Curriculum">
      <h4>Curriculum</h4>
      {data.mappings.length === 0 ? (
        <p>This record is not mapped to any topic.</p>
      ) : (
        <ul aria-label="Topic mappings">
          {data.mappings.map((mapping) => (
            <li key={mapping.id}>
              <RecordLink kind="topic" id={mapping.topicId} /> ({words(mapping.role)}) <RichText source={mapping.note} />
            </li>
          ))}
        </ul>
      )}
      {data.versions.length === 0 ? (
        <p>There is no exam version in this dataset, so no scope is derived.</p>
      ) : (
        <ul aria-label="Scope under each exam version" className={styles.scopes}>
          {data.versions.map((version, index) => {
            const why = data.explained[index] as ScopeExplanation;
            return (
              <li key={version.id} data-scope={why.scope}>
                <strong>
                  {exams[version.examId]?.name ?? version.examId}, <RecordLink kind="exam_version" id={version.id} label={version.label} />
                </strong>{' '}
                ({statusWords(version.status)}): {SCOPE_WORDS[why.scope]}. Why: <Reason why={why} />.
              </li>
            );
          })}
        </ul>
      )}
      {data.omitted > 0 ? <p className={styles.muted}>{data.omitted} more exam versions are not explained here (the first {MAX_VERSIONS} are).</p> : null}
    </section>
  );
}
