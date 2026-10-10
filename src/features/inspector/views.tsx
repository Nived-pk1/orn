/**
 * The levels each record kind shows between L1 (the header) and L5 (provenance). Step 5.6a part C1 shows the generic L2 only (the
 * description of the record); the kind views (species, class, reagent, reaction) arrive in part C2.
 */
import type { AnyRecord } from '@/core/schema';
import type { Finding } from '@/core/validation';
import { LevelSection } from './levels';
import { formulaOf } from './model/describe';
import { FactList, Facts } from './levels';
import { RichText } from './rich-text';

type Loose = Readonly<Record<string, unknown>>;

export function KindLevels(props: { readonly record: AnyRecord; readonly findings: readonly Finding[] }) {
  const loose = props.record as unknown as Loose;
  const formula = formulaOf(props.record);
  const description = typeof loose.description === 'string' ? loose.description : undefined;
  return (
    <LevelSection level={2} title="Summary">
      <FactList label="Summary">{formula === undefined ? null : <Facts label="Formula">{formula}</Facts>}</FactList>
      <RichText source={description} />
    </LevelSection>
  );
}
