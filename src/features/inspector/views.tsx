/**
 * The levels each record kind shows between L1 (the header) and L5 (provenance) (step 5.6a). Species, class, reagent and reaction have
 * their own views; any other kind shows its description, if it has one, at L2 and the whole record at L5 (nothing is hidden).
 */
import type { AnyRecord, ChemicalClass, Reaction, Reagent, Species } from '@/core/schema';
import type { Finding } from '@/core/validation';
import { FactList, LevelSection } from './levels';
import { formulaOf } from './model/describe';
import { RichText } from './rich-text';
import { TextFact } from './view-parts';
import { ReactionLevels } from './view-reaction';
import { ClassLevels, ReagentLevels, SpeciesLevels } from './view-substance';

type Loose = Readonly<Record<string, unknown>>;

export function KindLevels(props: { readonly record: AnyRecord; readonly findings: readonly Finding[] }) {
  const { record, findings } = props;
  switch (record.kind) {
    case 'species':
      return <SpeciesLevels record={record as Species} findings={findings} />;
    case 'class':
      return <ClassLevels record={record as ChemicalClass} findings={findings} />;
    case 'reagent':
      return <ReagentLevels record={record as Reagent} findings={findings} />;
    case 'reaction':
      return <ReactionLevels record={record as Reaction} findings={findings} />;
    default: {
      const loose = record as unknown as Loose;
      const description = typeof loose.description === 'string' ? loose.description : undefined;
      return (
        <LevelSection level={2} title="Summary">
          <FactList label="Summary">
            <TextFact label="Formula" value={formulaOf(record)} />
          </FactList>
          <RichText source={description} />
        </LevelSection>
      );
    }
  }
}
