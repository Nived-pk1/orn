/**
 * The curriculum records in the inspector (step 5.6b, item g): exam, exam version (coverage per unit; a status that is not official is
 * said in words: "provisional, not verified"), topic mapping and exam relevance. Fields as stored; L5 has the rest.
 */
import { useMemo } from 'react';
import type { Exam, ExamRelevance, ExamVersion, TopicMapping } from '@/core/schema';
import { statusWords } from './curriculum-facts';
import { useInspectorEnv } from './env';
import { FactList, Facts, LevelSection } from './levels';
import { RecordList } from './record-list';
import { RecordLink, RichText } from './rich-text';
import { CitationsAndTags, NoteFact, TextFact, words } from './view-parts';
import styles from './inspector.module.css';

const COVERAGE = { included: 'included', partial: 'partly included', excluded: 'excluded' } as const;

export function ExamLevels(props: { readonly record: Exam }) {
  const { record } = props;
  const env = useInspectorEnv();
  const versions = useMemo(
    () =>
      (Object.values(env.state.records.exam_version) as ExamVersion[])
        .filter((version) => version.examId === record.id)
        .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || (a.id < b.id ? -1 : 1)),
    [env, record.id],
  );
  return (
    <>
      <LevelSection level={2} title="What it is">
        <FactList label="Exam">
          <TextFact label="Short name" value={record.shortName} />
          <TextFact label="Authority" value={record.authority} />
          <NoteFact label="Notes" source={record.notes} />
        </FactList>
        <h4 className={styles.subheading}>Versions ({versions.length})</h4>
        {versions.length === 0 ? (
          <p className={styles.muted}>No version of this exam is in the dataset.</p>
        ) : (
          <RecordList
            label="Versions"
            items={versions.map((v) => ({ kind: 'exam_version', id: v.id, status: v.status }))}
            suffix={(item) => <span className={styles.muted}> ({statusWords(item.status)})</span>}
          />
        )}
      </LevelSection>
      <LevelSection level={4} title="Sources">
        <FactList label="Exam sources">
          <CitationsAndTags citations={record.citations} tags={record.tags} />
        </FactList>
      </LevelSection>
    </>
  );
}

export function ExamVersionLevels(props: { readonly record: ExamVersion }) {
  const { record } = props;
  return (
    <>
      <LevelSection level={2} title="What it is">
        <FactList label="Exam version">
          <Facts label="Exam">
            <RecordLink kind="exam" id={record.examId} />
          </Facts>
          <Facts label="Status">{statusWords(record.status)}</Facts>
          <TextFact label="Year" value={record.year === undefined ? undefined : String(record.year)} />
          <TextFact label="Effective from" value={record.effectiveFrom} />
          <TextFact label="Effective to" value={record.effectiveTo} />
          <NoteFact label="Notes" source={record.notes} />
          <Facts label="Units">{record.units.length}</Facts>
        </FactList>
      </LevelSection>
      <LevelSection level={3} title="Coverage per unit">
        {record.units.length === 0 ? <p className={styles.muted}>No unit is written for this version.</p> : null}
        <ol aria-label="Units" className={styles.steps}>
          {record.units.map((unit) => (
            <li key={unit.id} data-unit-id={unit.id}>
              <strong>
                {unit.code === undefined ? '' : `${unit.code}: `}
                {unit.title}
              </strong>
              <RichText source={unit.officialText} />
              {unit.topicCoverage.length === 0 ? (
                <p className={styles.muted}>This unit lists no topic.</p>
              ) : (
                <RecordList
                  label={`Topics of ${unit.title}`}
                  items={unit.topicCoverage.map((c) => ({ kind: 'topic', id: c.topicId, coverage: c.coverage, note: c.note }))}
                  prefix={(item) => <span>{COVERAGE[item.coverage]}: </span>}
                  suffix={(item) => (item.note === undefined ? null : <span className={styles.muted}> ({item.note})</span>)}
                />
              )}
            </li>
          ))}
        </ol>
      </LevelSection>
      <LevelSection level={4} title="Sources">
        <FactList label="Exam version sources">
          <CitationsAndTags citations={record.citations} tags={record.tags} />
        </FactList>
      </LevelSection>
    </>
  );
}

export function TopicMappingLevels(props: { readonly record: TopicMapping }) {
  const { record } = props;
  return (
    <LevelSection level={2} title="What it says">
      <FactList label="Topic mapping">
        <Facts label="Topic">
          <RecordLink kind="topic" id={record.topicId} />
        </Facts>
        <Facts label="Record">
          <RecordLink kind={record.target.kind} id={record.target.id} />
        </Facts>
        <Facts label="Role">{words(record.role)}</Facts>
        <NoteFact label="Note" source={record.note} />
      </FactList>
      <FactList label="Topic mapping sources">
        <CitationsAndTags citations={record.citations} tags={record.tags} />
      </FactList>
    </LevelSection>
  );
}

const SCOPE_NAMES = { official: 'official', prerequisite: 'prerequisite', enrichment: 'enrichment', outside: 'outside the syllabus' } as const;

export function ExamRelevanceLevels(props: { readonly record: ExamRelevance }) {
  const { record } = props;
  return (
    <LevelSection level={2} title="What it says">
      <FactList label="Exam relevance">
        <Facts label="Record">
          <RecordLink kind={record.target.kind} id={record.target.id} />
        </Facts>
        <Facts label="Exam">
          <RecordLink kind="exam" id={record.examId} />
        </Facts>
        <Facts label="Versions">
          {record.examVersionIds.length === 0
            ? 'every version of the exam'
            : record.examVersionIds.map((id, index) => (
                <span key={id}>
                  {index > 0 ? ', ' : ''}
                  <RecordLink kind="exam_version" id={id} />
                </span>
              ))}
        </Facts>
        <Facts label="Scope">{SCOPE_NAMES[record.scope]} (an override of the derived scope)</Facts>
        <TextFact label="Importance" value={record.importance === undefined ? undefined : `${record.importance} of 5`} />
        <NoteFact label="Note" source={record.note} />
      </FactList>
      <FactList label="Exam relevance sources">
        <CitationsAndTags citations={record.citations} tags={record.tags} />
      </FactList>
    </LevelSection>
  );
}
