/**
 * Route, topic, relationship and reference in the inspector (step 5.6b, item g). A route lists its steps in order with the reaction,
 * outcome and variant of each as links; a topic shows its parent, its children and the records mapped to it (a virtualised list); a
 * relationship names both ends in words; a reference shows what it is and which records cite it. Fields as stored; L5 has the rest.
 */
import { useMemo } from 'react';
import { RELATIONSHIP_TYPE_SPECS, type Reaction, type Reference, type Relationship, type Route, type Topic } from '@/core/schema';
import { Connections } from './connections';
import { useInspectorEnv } from './env';
import { FactList, Facts, LevelSection } from './levels';
import { RecordList } from './record-list';
import { ExternalLink, RecordLink, RichText } from './rich-text';
import { CitationsAndTags, LinkFact, NoteFact, TextFact, words } from './view-parts';
import styles from './inspector.module.css';

export function RouteLevels(props: { readonly record: Route }) {
  const { record } = props;
  const env = useInspectorEnv();
  const reactions = env.state.records.reaction as Readonly<Record<string, Reaction>>;
  const numberOf = new Map(record.steps.map((step, index) => [step.id, index + 1]));
  return (
    <>
      <LevelSection level={2} title="The route and its steps">
        <FactList label="Route">
          <Facts label="Purpose">{words(record.purpose)}</Facts>
          {record.target === undefined ? null : (
            <Facts label="Target">
              <RecordLink kind={record.target.kind} id={record.target.id} />
            </Facts>
          )}
          <NoteFact label="Description" source={record.description} />
        </FactList>
        <h4 className={styles.subheading}>Steps ({record.steps.length})</h4>
        {record.steps.length === 0 ? <p className={styles.muted}>The route has no steps.</p> : null}
        <ol aria-label="Steps of the route" className={styles.steps}>
          {record.steps.map((step, index) => {
            const reaction = reactions[step.reactionId];
            const outcome = step.outcomeId === undefined ? undefined : reaction?.outcomes.find((o) => o.id === step.outcomeId);
            const variant = step.conditionVariantId === undefined ? undefined : reaction?.conditionVariants.find((v) => v.id === step.conditionVariantId);
            return (
              <li key={step.id} data-step-id={step.id}>
                <strong>Step {index + 1}: </strong>
                <RecordLink kind="reaction" id={step.reactionId} />
                {step.outcomeId === undefined ? null : <span>, outcome {outcome?.label ?? step.outcomeId}</span>}
                {step.conditionVariantId === undefined ? null : <span>, conditions {variant?.label ?? step.conditionVariantId}</span>}
                <span className={styles.muted}>
                  {step.inputFromStepIds.length === 0 ? ', starts from available materials' : `, takes the products of step ${step.inputFromStepIds.map((id) => numberOf.get(id) ?? id).join(', ')}`}
                </span>
                <RichText source={step.note} />
              </li>
            );
          })}
        </ol>
      </LevelSection>
      <LevelSection level={3} title="Concepts">
        <FactList label="Route concepts">
          <LinkFact label="Concepts" refs={record.conceptIds.map((id) => ({ kind: 'concept', id }))} />
        </FactList>
      </LevelSection>
      <LevelSection level={4} title="Notes, sources and curriculum">
        <FactList label="Route notes">
          <NoteFact label="Notes" source={record.notes} />
          <CitationsAndTags citations={record.citations} tags={record.tags} />
        </FactList>
        <Connections target={{ kind: 'route', id: record.id }} />
      </LevelSection>
    </>
  );
}

export function TopicLevels(props: { readonly record: Topic }) {
  const { record } = props;
  const env = useInspectorEnv();
  const lists = useMemo(() => {
    const indexes = env.ports.indexes.current();
    const children = indexes.descendantsOf('topic', record.id).filter((id) => (indexes.get(id) as Topic | undefined)?.parentId === record.id);
    return { children, mapped: indexes.recordsInTopic(record.id, { transitive: false }) };
  }, [env, record.id]);
  return (
    <>
      <LevelSection level={2} title="Where it is in the tree">
        <FactList label="Topic">
          <Facts label="Kind">{words(record.topicKind)}</Facts>
          <TextFact label="Also called" value={record.aliases.join(', ')} />
          {record.parentId === undefined ? null : (
            <Facts label="Parent">
              <RecordLink kind="topic" id={record.parentId} />
            </Facts>
          )}
          <Facts label="Order among its siblings">{record.order}</Facts>
          <NoteFact label="Summary" source={record.summary} />
        </FactList>
        <h4 className={styles.subheading}>Children ({lists.children.length})</h4>
        {lists.children.length === 0 ? <p className={styles.muted}>It has no sub-topics.</p> : <RecordList label="Children" items={lists.children.map((id) => ({ kind: 'topic', id }))} />}
      </LevelSection>
      <LevelSection level={3} title="The records mapped to it">
        <h4 className={styles.subheading}>Mapped records ({lists.mapped.length})</h4>
        {lists.mapped.length === 0 ? <p className={styles.muted}>No record is mapped to this topic itself (a record under a sub-topic is listed there).</p> : <RecordList label="Mapped records" items={lists.mapped} />}
      </LevelSection>
      <LevelSection level={4} title="Notes and sources">
        <FactList label="Topic notes">
          <NoteFact label="Notes" source={record.notes} />
          <CitationsAndTags citations={record.citations} tags={record.tags} />
        </FactList>
      </LevelSection>
    </>
  );
}

export function RelationshipLevels(props: { readonly record: Relationship }) {
  const { record } = props;
  const spec = RELATIONSHIP_TYPE_SPECS[record.type];
  return (
    <>
      <LevelSection level={2} title="What it says">
        <FactList label="Relationship">
          <Facts label="Type">{spec.label}</Facts>
          <Facts label="From">
            <RecordLink kind={record.from.kind} id={record.from.id} />
          </Facts>
          <Facts label="To">
            <RecordLink kind={record.to.kind} id={record.to.id} />
          </Facts>
          <Facts label="Read both ways">
            {spec.symmetric ? `Both ends: ${spec.label} each other.` : `From to To: ${spec.label}. To to From: ${spec.inverseLabel}.`}
          </Facts>
          <TextFact label="Kind of reverse" value={record.reverseKind === undefined ? undefined : words(record.reverseKind)} />
          <NoteFact label="Note" source={record.note} />
        </FactList>
      </LevelSection>
      <LevelSection level={4} title="Sources">
        <FactList label="Relationship sources">
          <CitationsAndTags citations={record.citations} tags={record.tags} />
        </FactList>
      </LevelSection>
    </>
  );
}

export function ReferenceLevels(props: { readonly record: Reference }) {
  const { record } = props;
  const env = useInspectorEnv();
  const citedBy = useMemo(() => {
    const seen = new Set<string>();
    const out: { kind: string; id: string }[] = [];
    for (const referrer of env.ports.indexes.current().referrersOf(record.id)) {
      const key = `${referrer.owner.kind}:${referrer.owner.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ kind: referrer.owner.kind, id: referrer.owner.id });
      }
    }
    return out;
  }, [env, record.id]);
  return (
    <>
      <LevelSection level={2} title="What it is">
        <FactList label="Reference">
          <Facts label="Kind">{words(record.refKind)}</Facts>
          <TextFact label="Authors" value={record.authors.join(', ')} />
          <TextFact label="Year" value={record.year === undefined ? undefined : String(record.year)} />
          <TextFact label="Edition" value={record.edition} />
          <TextFact label="Publisher" value={record.publisher} />
          <TextFact label="Identifier" value={record.identifier} />
          {record.url === undefined ? null : (
            <Facts label="Address">
              <ExternalLink url={record.url} />
            </Facts>
          )}
          <NoteFact label="Notes" source={record.notes} />
        </FactList>
      </LevelSection>
      <LevelSection level={3} title="Who cites it">
        <h4 className={styles.subheading}>Cited by ({citedBy.length})</h4>
        {citedBy.length === 0 ? <p className={styles.muted}>No record cites it.</p> : <RecordList label="Cited by" items={citedBy} />}
      </LevelSection>
      <LevelSection level={4} title="Sources">
        <FactList label="Reference sources">
          <CitationsAndTags citations={record.citations} tags={record.tags} />
        </FactList>
      </LevelSection>
    </>
  );
}
