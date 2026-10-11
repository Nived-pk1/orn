/**
 * Named reaction, concept, transformation and caveat in the inspector (step 5.6b, item e). L2: what it is; L3: its detail and the
 * reactions that belong to it (a virtualised list); L4: notes, sources, relationships and curriculum. Every field is written as stored;
 * the raw record at L5 has the rest. No chemistry here.
 */
import { useMemo } from 'react';
import type { Caveat, Concept, NamedReaction, Transformation } from '@/core/schema';
import { Connections } from './connections';
import { useInspectorEnv } from './env';
import { FactList, Facts, LevelSection } from './levels';
import { parameterPhrases } from './model/conditions';
import { RecordList } from './record-list';
import { CitationsAndTags, LinkFact, NoteFact, TextFact, words } from './view-parts';
import styles from './inspector.module.css';

const reactionRefs = (ids: readonly string[]) => ids.map((id) => ({ kind: 'reaction', id }));

/** A reaction list in two parts: the ones that belong directly, and the ones that belong through a child family or concept. */
function ReactionsOf(props: { readonly label: string; readonly direct: readonly string[]; readonly below?: readonly string[] }) {
  const below = props.below ?? [];
  return (
    <>
      <h4 className={styles.subheading}>
        {props.label} ({props.direct.length})
      </h4>
      {props.direct.length === 0 ? <p className={styles.muted}>No reaction is listed here.</p> : <RecordList label={props.label} items={reactionRefs(props.direct)} />}
      {below.length === 0 ? null : (
        <>
          <h4 className={styles.subheading}>
            Reactions under its children ({below.length})
          </h4>
          <RecordList label={`${props.label}, under its children`} items={reactionRefs(below)} />
        </>
      )}
    </>
  );
}

const withoutAny = (all: readonly string[], some: readonly string[]): string[] => {
  const skip = new Set(some);
  return all.filter((id) => !skip.has(id));
};

/** The records that list `id` as a parent, nearest first (the hierarchy index gives all descendants; the direct children are those that name it). */
function ChildrenOf(props: { readonly kind: 'named_reaction' | 'concept'; readonly id: string }) {
  const env = useInspectorEnv();
  const children = useMemo(() => {
    const indexes = env.ports.indexes.current();
    return indexes.descendantsOf(props.kind, props.id).filter((childId) => {
      const record = indexes.get(childId) as unknown as { readonly parentIds?: readonly string[] } | undefined;
      return record?.parentIds?.includes(props.id) === true;
    });
  }, [env, props.kind, props.id]);
  if (children.length === 0) return null;
  return (
    <Facts label="Children">
      <RecordList label="Children" items={children.map((id) => ({ kind: props.kind, id }))} />
    </Facts>
  );
}

export function NamedReactionLevels(props: { readonly record: NamedReaction }) {
  const { record } = props;
  const env = useInspectorEnv();
  const lists = useMemo(() => {
    const indexes = env.ports.indexes.current();
    const direct = [...indexes.reactionsByNamedReaction(record.id, { includeDescendants: false })];
    const all = [...indexes.reactionsByNamedReaction(record.id, { includeDescendants: true })];
    return { direct, below: withoutAny(all, direct) };
  }, [env, record.id]);
  return (
    <>
      <LevelSection level={2} title="What it is">
        <FactList label="Named reaction">
          <TextFact label="Also called" value={record.aliases.join(', ')} />
          <LinkFact label="Family parents" refs={record.parentIds.map((id) => ({ kind: 'named_reaction', id }))} />
          <ChildrenOf kind="named_reaction" id={record.id} />
          <TextFact label="Difficulty" value={record.difficulty === undefined ? undefined : String(record.difficulty)} />
          <NoteFact label="Summary" source={record.summary} />
        </FactList>
      </LevelSection>
      <LevelSection level={3} title="Conditions, concepts and its reactions">
        <FactList label="Named reaction detail">
          <NoteFact label="Typical conditions" source={record.typicalConditions} />
          <LinkFact label="Concepts" refs={record.conceptIds.map((id) => ({ kind: 'concept', id }))} />
          <LinkFact label="Prerequisite concepts" refs={record.prerequisiteConceptIds.map((id) => ({ kind: 'concept', id }))} />
        </FactList>
        <ReactionsOf label="Reactions" direct={lists.direct} below={lists.below} />
      </LevelSection>
      <LevelSection level={4} title="Teaching notes, sources and curriculum">
        <FactList label="Named reaction notes">
          <NoteFact label="Study notes" source={record.studyNotes} />
          <NoteFact label="Notes" source={record.notes} />
          <CitationsAndTags citations={record.citations} tags={record.tags} />
        </FactList>
        <Connections target={{ kind: 'named_reaction', id: record.id }} />
      </LevelSection>
    </>
  );
}

export function ConceptLevels(props: { readonly record: Concept }) {
  const { record } = props;
  const env = useInspectorEnv();
  const lists = useMemo(() => {
    const indexes = env.ports.indexes.current();
    const direct = [...indexes.reactionsByConcept(record.id, { includeDescendants: false })];
    const all = [...indexes.reactionsByConcept(record.id, { includeDescendants: true })];
    return { direct, below: withoutAny(all, direct) };
  }, [env, record.id]);
  return (
    <>
      <LevelSection level={2} title="What it is">
        <FactList label="Concept">
          <Facts label="Kind">{words(record.conceptKind)}</Facts>
          <TextFact label="Also called" value={record.aliases.join(', ')} />
          <LinkFact label="Parents" refs={record.parentIds.map((id) => ({ kind: 'concept', id }))} />
          <ChildrenOf kind="concept" id={record.id} />
          <TextFact label="Difficulty" value={record.difficulty === undefined ? undefined : String(record.difficulty)} />
          <NoteFact label="Summary" source={record.summary} />
        </FactList>
      </LevelSection>
      <LevelSection level={3} title="The reactions that use it">
        <ReactionsOf label="Reactions" direct={lists.direct} below={lists.below} />
      </LevelSection>
      <LevelSection level={4} title="Notes, sources and curriculum">
        <FactList label="Concept notes">
          <NoteFact label="Study notes" source={record.studyNotes} />
          <NoteFact label="Notes" source={record.notes} />
          <CitationsAndTags citations={record.citations} tags={record.tags} />
        </FactList>
        <Connections target={{ kind: 'concept', id: record.id }} />
      </LevelSection>
    </>
  );
}

export function TransformationLevels(props: { readonly record: Transformation }) {
  const { record } = props;
  const env = useInspectorEnv();
  const reactions = useMemo(() => [...env.ports.indexes.current().reactionsByTransformation(record.id)], [env, record.id]);
  return (
    <>
      <LevelSection level={2} title="What it changes">
        <FactList label="Transformation">
          <TextFact label="Also called" value={record.aliases.join(', ')} />
          <LinkFact label="From" refs={record.fromClassIds.map((id) => ({ kind: 'class', id }))} />
          <LinkFact label="To" refs={record.toClassIds.map((id) => ({ kind: 'class', id }))} />
          <TextFact label="Equation" value={record.equationText} />
          <TextFact label="Carbon chain" value={record.carbonChainChange === undefined ? undefined : words(record.carbonChainChange)} />
          <TextFact label="Bonds changed" value={record.bondChangeSummary} />
          <NoteFact label="Description" source={record.description} />
        </FactList>
      </LevelSection>
      <LevelSection level={3} title="Detail and its reactions">
        <FactList label="Transformation detail">
          <TextFact label="Reaction SMARTS" value={record.reactionSmarts} />
          <LinkFact label="Concepts" refs={record.conceptIds.map((id) => ({ kind: 'concept', id }))} />
        </FactList>
        <ReactionsOf label="Reactions" direct={reactions} />
      </LevelSection>
      <LevelSection level={4} title="Notes, sources and curriculum">
        <FactList label="Transformation notes">
          <NoteFact label="Study notes" source={record.studyNotes} />
          <NoteFact label="Notes" source={record.notes} />
          <CitationsAndTags citations={record.citations} tags={record.tags} />
        </FactList>
        <Connections target={{ kind: 'transformation', id: record.id }} />
      </LevelSection>
    </>
  );
}

export function CaveatLevels(props: { readonly record: Caveat }) {
  const { record } = props;
  return (
    <>
      <LevelSection level={2} title="The caveat">
        <FactList label="Caveat">
          <Facts label="Kind">{words(record.caveatKind)}</Facts>
          <TextFact label="Importance" value={record.importance} />
          <NoteFact label="The rule" source={record.rule} />
          <NoteFact label="The exception" source={record.statement} />
          <NoteFact label="When it applies" source={record.trigger} />
        </FactList>
      </LevelSection>
      <LevelSection level={3} title="Conditions, explanation and what it affects">
        <FactList label="Caveat detail">
          {record.triggerConditions === undefined ? null : <Facts label="Trigger conditions">{parameterPhrases(record.triggerConditions).join('; ') || 'no conditions written'}</Facts>}
          <NoteFact label="Explanation" source={record.explanation} />
          <LinkFact label="Concepts" refs={record.conceptIds.map((id) => ({ kind: 'concept', id }))} />
        </FactList>
        <h4 className={styles.subheading}>Targets ({record.targets.length})</h4>
        {record.targets.length === 0 ? (
          <p className={styles.muted}>It names no target.</p>
        ) : (
          <RecordList
            label="Targets"
            items={record.targets.map((target) => ({ kind: target.ref.kind, id: target.ref.id, as: target.as }))}
            prefix={(item) => <span>{words(item.as)}: </span>}
          />
        )}
      </LevelSection>
      <LevelSection level={4} title="Notes, sources and curriculum">
        <FactList label="Caveat notes">
          <NoteFact label="Notes" source={record.notes} />
          <CitationsAndTags citations={record.citations} tags={record.tags} />
        </FactList>
        <Connections target={{ kind: 'caveat', id: record.id }} />
      </LevelSection>
    </>
  );
}
