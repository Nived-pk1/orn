/**
 * Species, class and reagent in the inspector (step 5.6a). L2: what it is; L3: its detail (properties, composition, profiles);
 * L4: notes, citations and tags. Every field that is shown is shown as stored; the raw record at L5 has the rest. No chemistry here.
 */
import type { ChemicalClass, Reagent, Species } from '@/core/schema';
import type { Finding } from '@/core/validation';
import { useMemo } from 'react';
import { Connections } from './connections';
import { Depiction } from './depiction';
import { useInspectorEnv } from './env';
import { FactList, Facts, LevelSection } from './levels';
import { nameOfRecord } from './model/describe';
import { parameterPhrases } from './model/conditions';
import { RecordList } from './record-list';
import { RecordLink } from './rich-text';
import { CitationsAndTags, LinkFact, NoteFact, TextFact, words } from './view-parts';
import styles from './inspector.module.css';

export function SpeciesLevels(props: { readonly record: Species; readonly findings: readonly Finding[] }) {
  const { record } = props;
  const env = useInspectorEnv();
  const derived = env.ports.l4.derivedFormulaOf({ kind: 'species', id: record.id });
  const name = nameOfRecord(record);
  return (
    <>
      <LevelSection level={2} title="Identity">
        <Depiction structure={record.structure} name={name} fallback={record.formula} />
        <FactList label="Species identity">
          <TextFact label="Formula (entered)" value={record.formula} />
          <TextFact label="Formula (derived from the structure)" value={derived} />
          <TextFact label="IUPAC name" value={record.names.iupac} />
          <TextFact label="Common names" value={record.names.common.join(', ')} />
          <TextFact label="Also called" value={record.names.aliases.join(', ')} />
          <Facts label="Kind">{words(record.speciesKind)}</Facts>
          {record.charge === undefined ? null : <Facts label="Charge">{record.charge}</Facts>}
          <LinkFact label="Classes" refs={record.classIds.map((id) => ({ kind: 'class', id }))} />
        </FactList>
      </LevelSection>
      <LevelSection level={3} title="Detail">
        <FactList label="Species detail">
          {record.structure === undefined ? null : <Facts label={`Structure as entered (${record.structure.format})`}>{record.structure.value}</Facts>}
          {record.stereo === undefined ? null : <Facts label="Stereo form">{[words(record.stereo.kind), ...record.stereo.descriptors].join(', ')}</Facts>}
          <NoteFact label="Stereochemistry note" source={record.stereo?.note} />
          <TextFact label="Aromaticity" value={record.aromaticity === undefined ? undefined : words(record.aromaticity)} />
          <TextFact label="Isotopes" value={record.isotopeNote} />
          {record.properties.map((property, index) => (
            <Facts key={index} label={property.label ?? words(property.key)}>
              {property.value}
              <NoteFact label="Note" source={property.note} />
            </Facts>
          ))}
          <NoteFact label="Acid-base notes" source={record.acidBaseNotes} />
        </FactList>
      </LevelSection>
      <LevelSection level={4} title="Notes and sources">
        <FactList label="Species notes">
          <NoteFact label="Study notes" source={record.studyNotes} />
          <NoteFact label="Notes" source={record.notes} />
          <CitationsAndTags citations={record.citations} tags={record.tags} />
        </FactList>
        <Connections target={{ kind: 'species', id: record.id }} />
      </LevelSection>
    </>
  );
}

/** The members of a class and the reactions that start from or make it: long lists, so virtualised. */
function ClassLists(props: { readonly record: ChemicalClass }) {
  const env = useInspectorEnv();
  const { record } = props;
  const lists = useMemo(() => {
    const indexes = env.ports.indexes.current();
    const me = { kind: 'class', id: record.id } as const;
    const members = indexes.speciesInClass(record.id, { transitive: false });
    const reactions = [...new Set([...indexes.participationsOf(me).map((p) => p.reactionId), ...indexes.productionsOf(me).map((p) => p.reactionId)])].sort();
    return { members, reactions: reactions.map((id) => ({ kind: 'reaction', id })) };
  }, [env, record.id]);
  return (
    <>
      <h4 className={styles.subheading}>Members ({lists.members.length})</h4>
      {lists.members.length === 0 ? <p className={styles.muted}>No species is listed as a member.</p> : <RecordList label="Members" items={lists.members} />}
      <h4 className={styles.subheading}>Reactions that use this class ({lists.reactions.length})</h4>
      {lists.reactions.length === 0 ? <p className={styles.muted}>No reaction names this class as a participant or a product.</p> : <RecordList label="Reactions of this class" items={lists.reactions} />}
    </>
  );
}

export function ClassLevels(props: { readonly record: ChemicalClass; readonly findings: readonly Finding[] }) {
  const { record } = props;
  const name = nameOfRecord(record);
  return (
    <>
      <LevelSection level={2} title="Identity">
        <Depiction structure={record.generic?.structure} name={name} fallback={record.generic?.formulaText} />
        <FactList label="Class identity">
          <TextFact label="Formula" value={record.generic?.formulaText} />
          <TextFact label="General formula" value={record.generic?.generalFormula} />
          <Facts label="Kind">{words(record.classKind)}</Facts>
          <LinkFact label="Parents" refs={record.parentIds.map((id) => ({ kind: 'class', id }))} />
          <LinkFact label="Examples" refs={record.exampleSpeciesIds.map((id) => ({ kind: 'species', id }))} />
          <NoteFact label="Description" source={record.description} />
        </FactList>
      </LevelSection>
      <LevelSection level={3} title="Detail">
        <FactList label="Class detail">
          <TextFact label="SMARTS" value={record.generic?.smarts} />
          <NoteFact label="R-group note" source={record.generic?.rGroupNote} />
          <TextFact label="Also called" value={record.names.aliases.join(', ')} />
        </FactList>
        <ClassLists record={record} />
      </LevelSection>
      <LevelSection level={4} title="Notes and sources">
        <FactList label="Class notes">
          <NoteFact label="Study notes" source={record.studyNotes} />
          <NoteFact label="Notes" source={record.notes} />
          <CitationsAndTags citations={record.citations} tags={record.tags} />
        </FactList>
        <Connections target={{ kind: 'class', id: record.id }} />
      </LevelSection>
    </>
  );
}

export function ReagentLevels(props: { readonly record: Reagent; readonly findings: readonly Finding[] }) {
  const { record } = props;
  return (
    <>
      <LevelSection level={2} title="Identity">
        <FactList label="Reagent identity">
          <TextFact label="Formula" value={record.formulaText} />
          <TextFact label="Families" value={record.families.map(words).join(', ')} />
          {record.speciesId === undefined ? null : (
            <Facts label="Species">
              <RecordLink kind="species" id={record.speciesId} />
            </Facts>
          )}
          <LinkFact label="Classes" refs={record.classIds.map((id) => ({ kind: 'class', id }))} />
          <NoteFact label="Description" source={record.description} />
        </FactList>
      </LevelSection>
      <LevelSection level={3} title="Composition and profiles">
        <FactList label="Reagent composition">
          {record.components.map((component, index) => (
            <Facts key={index} label={`Component (${words(component.role)})`}>
              <RecordLink kind={component.ref.kind} id={component.ref.id} />
              {component.amountText === undefined ? '' : `, ${component.amountText}`}
            </Facts>
          ))}
          {record.profiles.map((profile) => (
            <Facts key={profile.id} label={`Profile: ${profile.label}`}>
              {parameterPhrases(profile.parameters).join('; ')}
              {profile.aliases.length === 0 ? '' : ` (also: ${profile.aliases.join(', ')})`}
              <NoteFact label="Behaviour" source={profile.behaviour} />
            </Facts>
          ))}
        </FactList>
      </LevelSection>
      <LevelSection level={4} title="Notes and sources">
        <FactList label="Reagent notes">
          <NoteFact label="Study notes" source={record.studyNotes} />
          <NoteFact label="Notes" source={record.notes} />
          <CitationsAndTags citations={record.citations} tags={record.tags} />
        </FactList>
        <Connections target={{ kind: 'reagent', id: record.id }} />
      </LevelSection>
    </>
  );
}
